import type { PageSize } from '@pdf-memo/shared';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfAnalysis, PdfThumbnail } from '../../library/import/importPdf';
import { loadPdfjs, normalizeRotation } from './loadPdfjs';

export const THUMBNAIL_WIDTH = 240;

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 가져오기 시 한 번 실행: 페이지 수, 페이지별 크기(회전 전 pt)와 회전, 첫 페이지 썸네일.
 * pageSizes가 있어야 문서를 열지 않고도 가상 스크롤 레이아웃을 계산할 수 있다.
 */
export async function analyzePdf(blob: Blob): Promise<PdfAnalysis> {
  const pdfjs = await loadPdfjs();
  const data = new Uint8Array(await blob.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  try {
    const doc = await task.promise;
    const pageSizes: PageSize[] = [];
    for (let number = 1; number <= doc.numPages; number += 1) {
      const page = await doc.getPage(number);
      const viewport = page.getViewport({ scale: 1, rotation: 0 });
      pageSizes.push({
        w: round2(viewport.width),
        h: round2(viewport.height),
        rotation: normalizeRotation(page.rotate),
      });
      page.cleanup();
    }
    const thumbnail = await renderThumbnail(doc);
    return { pageCount: doc.numPages, pageSizes, thumbnail };
  } finally {
    await task.destroy();
  }
}

async function renderThumbnail(doc: PDFDocumentProxy): Promise<PdfThumbnail | null> {
  if (typeof document === 'undefined') return null;
  const page = await doc.getPage(1);
  try {
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: THUMBNAIL_WIDTH / base.width });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    return blob ? { blob, width: canvas.width, height: canvas.height } : null;
  } finally {
    page.cleanup();
  }
}
