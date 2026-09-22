import type {
  AnnotationObject,
  ImageObject,
  InkObject,
  NoteObject,
  TextObject,
} from '@pdf-memo/shared';
import type { PDFDocument, PDFFont, PDFImage, PDFPage, RGB } from 'pdf-lib';
import { inkOutline } from '../annotate/ink';
import { pdfAnchors } from '../sticker/model';
import { getPackSticker, isPackAssetId } from '../sticker/pack';
import { NOTE_EXPANDED_WIDTH, NOTE_SIZE, TEXT_LINE_HEIGHT, TEXT_PADDING } from '../text/model';
import { wrapText } from '../text/wrap';
import { hexToRgb01, outlineToSvgPath } from './svgPath';

export interface AssetBytes {
  mime: string;
  bytes: Uint8Array;
}

/** 이미지 객체가 참조하는 사용자 자산 (assetId → 바이트). 팩 스티커는 벡터라 필요 없다 */
export type FlattenAssets = ReadonlyMap<string, AssetBytes>;

export interface FlattenOptions {
  onProgress?: (donePages: number, totalPages: number) => void;
  /** 텍스트·노트를 그릴 때 임베드할 OTF/TTF 바이트. 없으면 텍스트 객체는 건너뛴다 */
  fontBytes?: Uint8Array;
  assets?: FlattenAssets;
}

export interface FlattenResult {
  bytes: Uint8Array;
  /** PDF에 그려 넣은 객체 수 */
  drawn: number;
  /** 아직 내보내기를 지원하지 않는 타입이거나 페이지·폰트·자산이 없어 건너뛴 객체 수 */
  skipped: number;
}

export class EncryptedPdfError extends Error {
  constructor() {
    super('암호로 보호된 PDF는 내보낼 수 없습니다');
    this.name = 'EncryptedPdfError';
  }
}

/** 노트 패널 글자 크기 (pt). TextLayer의 NoteMark와 같아야 한다 */
export const NOTE_FONT_SIZE = 11;
/** 글줄 위에서 기준선까지의 근사 비율 (line-height 1.3, ascent ≈ 0.8em) */
const BASELINE_RATIO = 0.8;

type PdfLib = typeof import('pdf-lib');

/**
 * 원본 PDF 위에 주석을 벡터로 굽는다(flatten).
 *
 * 좌표: 주석은 "페이지 공간"(pt, 원점 좌상단, 회전 0)에 저장된다. pdf.js의 회전 0 뷰포트와 같고,
 * 이는 CropBox(없으면 MediaBox)의 좌상단이 원점이다. pdf-lib의 drawSvgPath는 (x, y)를 SVG 원점으로
 * 두고 y축을 뒤집어 그리므로 원점을 CropBox 좌상단 (crop.x, crop.y + crop.height)로 주면 그대로 맞는다.
 * 텍스트는 같은 원점에서 y를 뒤집어 기준선을 계산한다. 페이지의 /Rotate는 표시 속성이라 콘텐츠 좌표에는 영향이 없다.
 */
export async function flattenAnnotations(
  original: Uint8Array,
  annotations: readonly AnnotationObject[],
  options: FlattenOptions = {},
): Promise<FlattenResult> {
  const lib = await import('pdf-lib');

  let doc: PDFDocument;
  try {
    doc = await lib.PDFDocument.load(original, { updateMetadata: false });
  } catch (error) {
    if (error instanceof Error && /encrypt/i.test(error.message)) throw new EncryptedPdfError();
    throw error;
  }

  const byPage = groupByPage(annotations);
  const needsFont = [...byPage.values()].some((objects) =>
    objects.some((o) => o.type === 'text' || o.type === 'note'),
  );
  let font: PDFFont | null = null;
  if (needsFont && options.fontBytes) {
    const { createPdfFontkit } = await import('../text/pdfFontkit');
    doc.registerFontkit(createPdfFontkit());
    font = await doc.embedFont(options.fontBytes, { subset: true });
  }

  const deps: DrawDeps = {
    lib,
    doc,
    font,
    assets: options.assets ?? new Map(),
    images: new Map(),
  };
  const pages = doc.getPages();
  let drawn = 0;
  let skipped = 0;
  let done = 0;

  for (const [pageIndex, objects] of byPage) {
    const page = pages[pageIndex];
    if (!page) {
      skipped += objects.length;
      continue;
    }
    const crop = page.getCropBox();
    const origin = { x: crop.x, y: crop.y + crop.height };
    for (const object of objects) {
      let ok = false;
      switch (object.type) {
        case 'ink':
          drawInk(page, object, origin, deps);
          ok = true;
          break;
        case 'text':
          if (deps.font) {
            drawTextBox(page, object, origin, deps);
            ok = true;
          }
          break;
        case 'note':
          if (deps.font) {
            drawNote(page, object, origin, deps);
            ok = true;
          }
          break;
        case 'image':
          ok = await drawImageObject(page, object, origin, deps);
          break;
        default:
      }
      if (ok) drawn += 1;
      else skipped += 1;
    }
    done += 1;
    options.onProgress?.(done, byPage.size);
    // 긴 문서에서 UI가 굳지 않도록 페이지마다 한 번 양보
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  doc.setModificationDate(new Date());
  const bytes = await doc.save({ useObjectStreams: true });
  return { bytes, drawn, skipped };
}

/** 살아 있는 객체만 페이지별로 z 순 정렬 */
export function groupByPage(
  annotations: readonly AnnotationObject[],
): Map<number, AnnotationObject[]> {
  const byPage = new Map<number, AnnotationObject[]>();
  for (const object of annotations) {
    if (object.deletedAt !== null) continue;
    const list = byPage.get(object.pageIndex);
    if (list) list.push(object);
    else byPage.set(object.pageIndex, [object]);
  }
  for (const list of byPage.values()) list.sort((a, b) => a.z - b.z);
  return new Map([...byPage.entries()].sort((a, b) => a[0] - b[0]));
}

interface DrawDeps {
  lib: PdfLib;
  doc: PDFDocument;
  font: PDFFont | null;
  assets: FlattenAssets;
  /** 한 번 임베드한 이미지는 다시 쓴다 (assetId → PDFImage) */
  images: Map<string, PDFImage>;
}

interface Origin {
  x: number;
  y: number;
}

function toRgb(hex: string, deps: DrawDeps): RGB {
  const { r, g, b } = hexToRgb01(hex);
  return deps.lib.rgb(r, g, b);
}

function drawInk(page: PDFPage, ink: InkObject, origin: Origin, deps: DrawDeps) {
  const path = outlineToSvgPath(inkOutline(ink));
  if (!path) return;
  page.drawSvgPath(path, {
    x: origin.x,
    y: origin.y,
    color: toRgb(ink.color, deps),
    opacity: ink.opacity,
    borderWidth: 0,
    blendMode: ink.tool === 'highlighter' ? deps.lib.BlendMode.Multiply : undefined,
  });
}

function safeWidth(font: PDFFont, text: string, size: number): number {
  try {
    return font.widthOfTextAtSize(text, size);
  } catch {
    return [...text].length * size * 0.55;
  }
}

/** 줄 목록을 상자 안에 그린다. 화면과 같은 여백·행간·정렬 규칙 */
function drawLines(
  page: PDFPage,
  lines: string[],
  box: { x: number; y: number; innerWidth: number },
  size: number,
  align: TextObject['align'],
  color: RGB,
  origin: Origin,
  font: PDFFont,
) {
  const lineHeight = size * TEXT_LINE_HEIGHT;
  lines.forEach((line, index) => {
    if (line === '') return;
    const width = safeWidth(font, line, size);
    const dx =
      align === 'center'
        ? (box.innerWidth - width) / 2
        : align === 'right'
          ? box.innerWidth - width
          : 0;
    const baseline = box.y + index * lineHeight + (lineHeight - size) / 2 + size * BASELINE_RATIO;
    try {
      page.drawText(line, {
        x: origin.x + box.x + dx,
        y: origin.y - baseline,
        size,
        font,
        color,
      });
    } catch (error) {
      console.warn('[flatten] text line skipped', error);
    }
  });
}

function drawTextBox(page: PDFPage, text: TextObject, origin: Origin, deps: DrawDeps) {
  const font = deps.font as PDFFont;
  const size = text.fontSize;
  const innerWidth = Math.max(1, text.w - TEXT_PADDING * 2);
  const lines = wrapText(text.content, innerWidth, (s) => safeWidth(font, s, size));
  const height = Math.max(text.h, lines.length * size * TEXT_LINE_HEIGHT + TEXT_PADDING * 2);
  if (text.background) {
    page.drawRectangle({
      x: origin.x + text.x,
      y: origin.y - text.y - height,
      width: text.w,
      height,
      color: toRgb(text.background, deps),
    });
  }
  drawLines(
    page,
    lines,
    { x: text.x + TEXT_PADDING, y: text.y + TEXT_PADDING, innerWidth },
    size,
    text.align,
    toRgb(text.color, deps),
    origin,
    font,
  );
}

function drawNote(page: PDFPage, note: NoteObject, origin: Origin, deps: DrawDeps) {
  const font = deps.font as PDFFont;
  const fill = toRgb(note.color, deps);
  page.drawRectangle({
    x: origin.x + note.x,
    y: origin.y - note.y - NOTE_SIZE,
    width: NOTE_SIZE,
    height: NOTE_SIZE,
    color: fill,
    borderColor: deps.lib.rgb(0.35, 0.3, 0.1),
    borderWidth: 0.6,
  });
  if (note.collapsed || note.content.trim() === '') return;

  const innerWidth = NOTE_EXPANDED_WIDTH - TEXT_PADDING * 2;
  const lines = wrapText(note.content, innerWidth, (s) => safeWidth(font, s, NOTE_FONT_SIZE));
  const height = lines.length * NOTE_FONT_SIZE * TEXT_LINE_HEIGHT + TEXT_PADDING * 2;
  const boxX = note.x + NOTE_SIZE + 4;
  page.drawRectangle({
    x: origin.x + boxX,
    y: origin.y - note.y - height,
    width: NOTE_EXPANDED_WIDTH,
    height,
    color: fill,
    opacity: 0.92,
  });
  drawLines(
    page,
    lines,
    { x: boxX + TEXT_PADDING, y: note.y + TEXT_PADDING, innerWidth },
    NOTE_FONT_SIZE,
    'left',
    deps.lib.rgb(0.1, 0.1, 0.12),
    origin,
    font,
  );
}

/**
 * 스티커·이미지. 팩 스티커는 화면과 같은 path를 drawSvgPath로(벡터), 사용자 이미지는 PNG/JPEG XObject로 굽는다.
 * 둘 다 중심을 축으로 회전한 결과가 되도록 기준점을 pdfAnchors로 계산한다.
 */
async function drawImageObject(
  page: PDFPage,
  image: ImageObject,
  origin: Origin,
  deps: DrawDeps,
): Promise<boolean> {
  const { degrees, LineCapStyle } = deps.lib;
  const anchors = pdfAnchors(image, origin);

  if (isPackAssetId(image.assetId)) {
    const def = getPackSticker(image.assetId);
    if (!def) return false;
    const scale = image.w / def.width;
    for (const shape of def.shapes) {
      const alpha = (shape.opacity ?? 1) * image.opacity;
      page.drawSvgPath(shape.d, {
        x: anchors.svg.x,
        y: anchors.svg.y,
        scale,
        rotate: degrees(anchors.rotateDeg),
        color: shape.fill ? toRgb(shape.fill, deps) : undefined,
        borderColor: shape.stroke ? toRgb(shape.stroke, deps) : undefined,
        borderWidth: shape.stroke ? (shape.strokeWidth ?? 1) : 0,
        borderLineCap: shape.lineCap === 'round' ? LineCapStyle.Round : undefined,
        opacity: alpha,
        borderOpacity: alpha,
      });
    }
    return true;
  }

  let embedded = deps.images.get(image.assetId);
  if (!embedded) {
    const asset = deps.assets.get(image.assetId);
    if (!asset) return false;
    try {
      embedded = /jpe?g$/i.test(asset.mime)
        ? await deps.doc.embedJpg(asset.bytes)
        : await deps.doc.embedPng(asset.bytes);
    } catch (error) {
      console.warn('[flatten] image skipped', image.assetId, error);
      return false;
    }
    deps.images.set(image.assetId, embedded);
  }
  page.drawImage(embedded, {
    x: anchors.image.x,
    y: anchors.image.y,
    width: image.w,
    height: image.h,
    rotate: degrees(anchors.rotateDeg),
    opacity: image.opacity,
  });
  return true;
}
