import { HEIC_MESSAGE, imagesTitle, isHeicFile } from './detect';

/** 저장할 이미지의 긴 변 상한 (px). 필기용 화질로 충분하고 PDF가 너무 커지지 않는다 */
export const IMAGE_PAGE_MAX_PX = 2500;
/** 페이지의 짧은 변 (pt) = A4 폭. 펜 굵기 같은 pt 단위 도구가 PDF 문서와 비슷하게 보이도록 맞춘다 */
export const IMAGE_PAGE_SHORT_SIDE = 595.28;
export const MAX_IMAGE_INPUT_BYTES = 50 * 1024 * 1024;
const JPEG_QUALITY = 0.88;

export interface PreparedImage {
  mime: 'image/jpeg' | 'image/png';
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface ImagesConversion {
  file: File;
  title: string;
  originalFileName: string;
  pageCount: number;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** 이미지 비율을 그대로 살린 페이지 크기. 짧은 변을 A4 폭에 맞춘다(가로 사진은 가로 페이지) */
export function imagePageSize(width: number, height: number): { w: number; h: number } {
  if (width >= height) {
    return { w: round2((IMAGE_PAGE_SHORT_SIDE * width) / height), h: IMAGE_PAGE_SHORT_SIDE };
  }
  return { w: IMAGE_PAGE_SHORT_SIDE, h: round2((IMAGE_PAGE_SHORT_SIDE * height) / width) };
}

/** 준비된 이미지들을 한 장 = 한 페이지로 담은 PDF */
export async function buildImagePdf(
  images: readonly PreparedImage[],
  title: string,
): Promise<{ bytes: Uint8Array; pageCount: number }> {
  if (images.length === 0) throw new Error('이미지가 없습니다');
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();
  for (const image of images) {
    const embedded =
      image.mime === 'image/jpeg'
        ? await pdf.embedJpg(image.bytes)
        : await pdf.embedPng(image.bytes);
    const { w, h } = imagePageSize(image.width, image.height);
    const page = pdf.addPage([w, h]);
    page.drawImage(embedded, { x: 0, y: 0, width: w, height: h });
  }
  pdf.setTitle(title);
  pdf.setProducer('PDF MEMO');
  pdf.setCreator('PDF MEMO (이미지)');
  const bytes = await pdf.save({ useObjectStreams: true });
  return { bytes, pageCount: images.length };
}

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    // EXIF 회전을 반영한다 (옵션을 모르는 브라우저는 기본 호출로)
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        /* 아래 <img> 경로로 */
      }
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('이미지를 읽을 수 없습니다'));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 투명 픽셀이 있는지 띄엄띄엄 검사한다 (없으면 JPEG로 저장해 크기를 줄인다) */
function hasAlpha(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  const { data } = ctx.getImageData(0, 0, width, height);
  for (let i = 3; i < data.length; i += 4 * 7) {
    if (data[i] < 250) return true;
  }
  return false;
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했습니다'))),
      mime,
      quality,
    );
  });
}

/** 파일을 디코딩해 긴 변 2500px 이하로 줄이고 JPEG(불투명) 또는 PNG(투명)로 다시 인코딩한다 */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (isHeicFile(file)) throw new Error(HEIC_MESSAGE);
  if (file.size > MAX_IMAGE_INPUT_BYTES)
    throw new Error(`${file.name}: 이미지가 너무 큽니다 (최대 50MB)`);
  const source = await decodeImage(file);
  const srcW = source.width;
  const srcH = source.height;
  if (!srcW || !srcH) throw new Error(`${file.name}: 이미지 크기를 알 수 없습니다`);
  const ratio = Math.min(1, IMAGE_PAGE_MAX_PX / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * ratio));
  const height = Math.max(1, Math.round(srcH * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다');
  ctx.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();

  const isJpegSource = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
  const useJpeg = isJpegSource || !hasAlpha(ctx, width, height);
  const mime = useJpeg ? 'image/jpeg' : 'image/png';
  const blob = await toBlob(canvas, mime, useJpeg ? JPEG_QUALITY : undefined);
  return { mime, bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
}

/**
 * 이미지 파일들을 PDF 한 개로 바꾼다 (한 장 = 한 페이지, 넣은 순서대로).
 * 결과 File은 그대로 PDF 가져오기 파이프라인에 넣을 수 있다.
 */
export async function imageFilesToPdf(
  files: readonly File[],
  onProgress?: (done: number, total: number) => void,
): Promise<ImagesConversion> {
  if (files.length === 0) throw new Error('이미지가 없습니다');
  const heic = files.find(isHeicFile);
  if (heic) throw new Error(HEIC_MESSAGE);
  const prepared: PreparedImage[] = [];
  for (const file of files) {
    prepared.push(await prepareImage(file));
    onProgress?.(prepared.length, files.length);
  }
  const title = imagesTitle(files);
  const { bytes, pageCount } = await buildImagePdf(prepared, title);
  const safeName = title.replace(/[\\/:*?"<>|]/g, ' ').trim() || '이미지';
  const file = new File([new Uint8Array(bytes)], `${safeName}.pdf`, {
    type: 'application/pdf',
    lastModified: files[0].lastModified,
  });
  return { file, title, originalFileName: files[0].name, pageCount };
}
