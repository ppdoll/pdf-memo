import type { AnnotationObject, InkObject } from '@pdf-memo/shared';
import type { PDFPage } from 'pdf-lib';
import { inkOutline } from '../annotate/ink';
import { hexToRgb01, outlineToSvgPath } from './svgPath';

export interface FlattenOptions {
  onProgress?: (donePages: number, totalPages: number) => void;
}

export interface FlattenResult {
  bytes: Uint8Array;
  /** PDF에 그려 넣은 객체 수 */
  drawn: number;
  /** 아직 내보내기를 지원하지 않는 타입이거나 페이지가 없어 건너뛴 객체 수 */
  skipped: number;
}

export class EncryptedPdfError extends Error {
  constructor() {
    super('암호로 보호된 PDF는 내보낼 수 없습니다');
    this.name = 'EncryptedPdfError';
  }
}

/**
 * 원본 PDF 위에 주석을 벡터로 굽는다(flatten).
 *
 * 좌표: 주석은 "페이지 공간"(pt, 원점 좌상단, 회전 0)에 저장된다. pdf.js의 회전 0 뷰포트와 같고,
 * 이는 CropBox(없으면 MediaBox)의 좌상단이 원점이다. pdf-lib의 drawSvgPath는 (x, y)를 SVG 원점으로
 * 두고 y축을 뒤집어 그리므로 원점을 CropBox 좌상단 (crop.x, crop.y + crop.height)로 주면 그대로 맞는다.
 * 페이지의 /Rotate는 표시 속성이라 콘텐츠 좌표에는 영향이 없다.
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

  const pages = doc.getPages();
  const byPage = groupByPage(annotations);
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
      if (object.type === 'ink') {
        drawInk(page, object, origin, {
          rgb,
          multiply: BlendMode.Multiply,
        });
        drawn += 1;
      } else {
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
  rgb: (r: number, g: number, b: number) => import('pdf-lib').RGB;
  multiply: import('pdf-lib').BlendMode;
}

function drawInk(page: PDFPage, ink: InkObject, origin: { x: number; y: number }, deps: DrawDeps) {
  const path = outlineToSvgPath(inkOutline(ink));
  if (!path) return;
  const { r, g, b } = hexToRgb01(ink.color);
  page.drawSvgPath(path, {
    x: origin.x,
    y: origin.y,
    color: deps.rgb(r, g, b),
    opacity: ink.opacity,
    borderWidth: 0,
    blendMode: ink.tool === 'highlighter' ? deps.multiply : undefined,
  });
}
