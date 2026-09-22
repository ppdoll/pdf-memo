import { nowIso } from '@pdf-memo/shared';
import { sha256Hex } from '../../lib/hash';
import type { Asset, Storage } from '../../storage/ports';

/** 폴더 아이콘 색 팔레트 (첫 번째가 기본) */
export const FOLDER_COLORS = [
  '#a5b4fc',
  '#93c5fd',
  '#5eead4',
  '#86efac',
  '#fde047',
  '#fdba74',
  '#fca5a5',
  '#f9a8d4',
  '#c4b5fd',
  '#d6d3d1',
] as const;

export const DEFAULT_FOLDER_COLOR = FOLDER_COLORS[0];
/** 아이콘 이미지는 정사각형으로 잘라 이 크기로 저장한다 */
export const FOLDER_ICON_PX = 128;
const MAX_ICON_INPUT_BYTES = 20 * 1024 * 1024;

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
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

/**
 * 폴더 아이콘용 이미지를 만든다: 가운데를 정사각형으로 잘라 128px PNG로 저장.
 * id는 바이트의 sha-256이라 같은 이미지는 한 번만 저장된다.
 */
export async function createFolderIconAsset(storage: Storage, file: File): Promise<Asset> {
  if (!/^image\//i.test(file.type) && !/\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name)) {
    throw new Error('이미지 파일을 골라 주세요 (PNG·JPEG·WebP)');
  }
  if (/hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) {
    throw new Error('HEIC 사진은 브라우저가 열 수 없습니다. JPEG나 PNG로 바꿔 주세요');
  }
  if (file.size > MAX_ICON_INPUT_BYTES) throw new Error('이미지가 너무 큽니다 (최대 20MB)');
  const source = await decodeImage(file);
  const srcW = source.width;
  const srcH = source.height;
  if (!srcW || !srcH) throw new Error('이미지 크기를 알 수 없습니다');
  const side = Math.min(srcW, srcH);
  const sx = (srcW - side) / 2;
  const sy = (srcH - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = FOLDER_ICON_PX;
  canvas.height = FOLDER_ICON_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다');
  ctx.drawImage(source, sx, sy, side, side, 0, 0, FOLDER_ICON_PX, FOLDER_ICON_PX);
  if ('close' in source) source.close();

  const data = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했습니다'))),
      'image/png',
    );
  });
  const id = await sha256Hex(data);
  const existing = await storage.assets.get(id);
  if (existing) return existing;
  const asset: Asset = {
    id,
    kind: 'icon',
    mime: 'image/png',
    width: FOLDER_ICON_PX,
    height: FOLDER_ICON_PX,
    byteSize: data.size,
    createdAt: nowIso(),
    ownerId: null,
    data,
  };
  await storage.assets.put(asset);
  return asset;
}
