import type { AnnotationObject, InkObject, NoteObject, TextObject } from '@pdf-memo/shared';
import type { PDFFont, PDFPage, RGB } from 'pdf-lib';
import { inkOutline } from '../annotate/ink';
import { NOTE_EXPANDED_WIDTH, NOTE_SIZE, TEXT_LINE_HEIGHT, TEXT_PADDING } from '../text/model';
import { wrapText } from '../text/wrap';
import { hexToRgb01, outlineToSvgPath } from './svgPath';

export interface FlattenOptions {
  onProgress?: (donePages: number, totalPages: number) => void;
  /** 텍스트·노트를 그릴 때 임베드할 OTF/TTF 바이트. 없으면 텍스트 객체는 건너뛴다 */
  fontBytes?: Uint8Array;
}

export interface FlattenResult {
  bytes: Uint8Array;
  /** PDF에 그려 넣은 객체 수 */
  drawn: number;
  /** 아직 내보내기를 지원하지 않는 타입이거나 페이지·폰트가 없어 건너뛴 객체 수 */
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
  const { PDFDocument, rgb, BlendMode } = await import('pdf-lib');

  let doc;
  try {
    doc = await PDFDocument.load(original, { updateMetadata: false });
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

  const deps: DrawDeps = { rgb, multiply: BlendMode.Multiply, font };
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
      switch (object.type) {
        case 'ink':
          drawInk(page, object, origin, deps);
          drawn += 1;
          break;
        case 'text':
          if (deps.font) {
            drawTextBox(page, object, origin, deps);
            drawn += 1;
          } else {
            skipped += 1;
          }
          break;
        case 'note':
          if (deps.font) {
            drawNote(page, object, origin, deps);
            drawn += 1;
          } else {
            skipped += 1;
          }
          break;
        default:
          skipped += 1;
      }
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
  rgb: (r: number, g: number, b: number) => RGB;
  multiply: import('pdf-lib').BlendMode;
  font: PDFFont | null;
}

interface Origin {
  x: number;
  y: number;
}

function toRgb(hex: string, deps: DrawDeps): RGB {
  const { r, g, b } = hexToRgb01(hex);
  return deps.rgb(r, g, b);
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
    blendMode: ink.tool === 'highlighter' ? deps.multiply : undefined,
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
    borderColor: deps.rgb(0.35, 0.3, 0.1),
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
    deps.rgb(0.1, 0.1, 0.12),
    origin,
    font,
  );
}
