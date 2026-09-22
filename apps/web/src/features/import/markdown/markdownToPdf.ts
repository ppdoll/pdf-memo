import { loadTextFontBoldBytes, loadTextFontBytes } from '../../text/font';
import { titleFromMarkdownFileName } from './detect';
import { collectImageSources } from './model';
import { parseMarkdown, plainTextToMarkdown } from './parse';
import { renderMarkdownPdf, type LoadedImage } from './render';

/** 마크다운 원문 상한 (2MB). PDF 상한과 별개 */
export const MAX_MARKDOWN_BYTES = 2 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_PX = 1600;

export interface MarkdownConversion {
  file: File;
  title: string;
  originalFileName: string;
  pageCount: number;
  /** 불러오지 못한 이미지 수 */
  missingImages: number;
}

async function decodeToPngOrJpeg(
  blob: Blob,
): Promise<{ mime: string; bytes: Uint8Array; width: number; height: number } | null> {
  const bitmap = await createImageBitmap(blob);
  const ratio = Math.min(1, MAX_IMAGE_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * ratio));
  const height = Math.max(1, Math.round(bitmap.height * ratio));
  const keep = ratio === 1 && /^image\/(png|jpeg)$/i.test(blob.type);
  if (keep) {
    bitmap.close();
    return { mime: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!png) return null;
  return { mime: 'image/png', bytes: new Uint8Array(await png.arrayBuffer()), width, height };
}

/** data: URL이나 CORS를 허용하는 http(s) 이미지를 PNG/JPEG 바이트로 (실패는 건너뜀) */
async function loadImage(src: string): Promise<LoadedImage | null> {
  try {
    let blob: Blob;
    if (src.startsWith('data:')) {
      blob = await (await fetch(src)).blob();
    } else if (/^https?:\/\//i.test(src)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
      try {
        const response = await fetch(src, { mode: 'cors', signal: controller.signal });
        if (!response.ok) return null;
        blob = await response.blob();
      } finally {
        clearTimeout(timer);
      }
    } else {
      return null;
    }
    if (!blob.type.startsWith('image/')) return null;
    return await decodeToPngOrJpeg(blob);
  } catch {
    return null;
  }
}

/**
 * 마크다운(.md) 또는 일반 텍스트(.txt) 파일을 A4 PDF 파일로 바꾼다.
 * 결과 File은 그대로 PDF 가져오기 파이프라인에 넣을 수 있다.
 */
export async function markdownFileToPdf(
  file: File,
  onStage?: (stage: 'reading' | 'images' | 'rendering') => void,
): Promise<MarkdownConversion> {
  if (file.size > MAX_MARKDOWN_BYTES) throw new Error('마크다운 파일이 너무 큽니다 (최대 2MB)');
  onStage?.('reading');
  let text = await file.text();
  if (/\.txt$/i.test(file.name)) text = plainTextToMarkdown(text);
  if (text.trim().length === 0) throw new Error('빈 파일입니다');

  const doc = parseMarkdown(text);
  const title = doc.title ?? titleFromMarkdownFileName(file.name);

  onStage?.('images');
  const sources = collectImageSources(doc.blocks);
  const images = new Map<string, LoadedImage>();
  await Promise.all(
    sources.map(async (src) => {
      const loaded = await loadImage(src);
      if (loaded) images.set(src, loaded);
    }),
  );

  onStage?.('rendering');
  const [regular, boldFont] = await Promise.all([loadTextFontBytes(), loadTextFontBoldBytes()]);
  const { bytes, pageCount } = await renderMarkdownPdf({
    doc,
    fonts: { regular, bold: boldFont },
    images,
    title,
  });
  const safeName = title.replace(/[\\/:*?"<>|]/g, ' ').trim() || '문서';
  const pdfFile = new File([new Uint8Array(bytes)], `${safeName}.pdf`, {
    type: 'application/pdf',
    lastModified: file.lastModified,
  });
  return {
    file: pdfFile,
    title,
    originalFileName: file.name,
    pageCount,
    missingImages: sources.length - images.size,
  };
}
