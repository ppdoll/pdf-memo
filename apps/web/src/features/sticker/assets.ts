import { nowIso, type AssetMeta } from '@pdf-memo/shared';
import { useEffect, useState } from 'react';
import { sha256Hex } from '../../lib/hash';

import type { Asset, Storage } from '../../storage/ports';
import type { StickerRef } from './model';
import { getPackSticker, isPackAssetId, type StickerDef } from './pack';

/** 사용자 이미지는 긴 변을 이 픽셀 이하로 줄여 저장한다 */
export const USER_IMAGE_MAX_PX = 1024;
const ACCEPTED_INPUT = /^image\/(png|jpeg|jpg|webp|gif|bmp|avif|svg\+xml)$/i;

export function stickerRefForPack(def: StickerDef): StickerRef {
  return { assetId: def.id, width: def.width, height: def.height };
}

export function stickerRefForAsset(asset: AssetMeta): StickerRef {
  return { assetId: asset.id, width: asset.width, height: asset.height };
}

export class UnsupportedImageError extends Error {
  constructor(type: string) {
    super(`지원하지 않는 이미지 형식입니다: ${type || '알 수 없음'}`);
    this.name = 'UnsupportedImageError';
  }
}

async function decodeImage(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* 아래 <img> 경로로 */
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

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('이미지 변환에 실패했습니다'))),
      mime,
      quality,
    );
  });
}

/**
 * 사용자 이미지를 스티커 자산으로 저장한다. 긴 변 1024px 이하로 줄이고,
 * JPEG는 JPEG(0.9)로, 나머지는 PNG로 다시 인코딩한다(내보내기가 PNG/JPEG만 임베드할 수 있다).
 * id는 저장 바이트의 sha-256이라 같은 이미지는 한 번만 저장된다.
 */
export async function importUserImage(storage: Storage, file: File): Promise<Asset> {
  if (!ACCEPTED_INPUT.test(file.type)) throw new UnsupportedImageError(file.type);
  const source = await decodeImage(file);
  const srcW = source.width;
  const srcH = source.height;
  if (!srcW || !srcH) throw new Error('이미지 크기를 알 수 없습니다');
  const ratio = Math.min(1, USER_IMAGE_MAX_PX / Math.max(srcW, srcH));
  const width = Math.max(1, Math.round(srcW * ratio));
  const height = Math.max(1, Math.round(srcH * ratio));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('캔버스를 만들 수 없습니다');
  ctx.drawImage(source, 0, 0, width, height);
  if ('close' in source) source.close();

  const isJpeg = /jpe?g$/i.test(file.type);
  const mime = isJpeg ? 'image/jpeg' : 'image/png';
  const data = await toBlob(canvas, mime, isJpeg ? 0.9 : undefined);
  const id = await sha256Hex(data);
  const existing = await storage.assets.get(id);
  if (existing) return existing;

  const asset: Asset = {
    id,
    kind: 'image',
    mime,
    width,
    height,
    byteSize: data.size,
    createdAt: nowIso(),
    ownerId: null,
    data,
  };
  await storage.assets.put(asset);
  return asset;
}

const urlCache = new Map<string, Promise<string | null>>();

/** 자산 바이트의 object URL (세션 동안 캐시). 팩 스티커는 null */
export function assetObjectUrl(storage: Storage, assetId: string): Promise<string | null> {
  if (isPackAssetId(assetId)) return Promise.resolve(null);
  let cached = urlCache.get(assetId);
  if (!cached) {
    cached = storage.assets.get(assetId).then((asset) => {
      if (!asset) return null;
      return URL.createObjectURL(asset.data);
    });
    cached.catch(() => urlCache.delete(assetId));
    urlCache.set(assetId, cached);
  }
  return cached;
}

/** 삭제 등으로 자산이 바뀌면 캐시를 버린다 */
export function forgetAssetUrl(assetId: string): void {
  const cached = urlCache.get(assetId);
  urlCache.delete(assetId);
  void cached?.then((url) => url && URL.revokeObjectURL(url));
}

export function useAssetUrl(storage: Storage, assetId: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void assetObjectUrl(storage, assetId).then((value) => {
      if (!cancelled) setUrl(value);
    });
    return () => {
      cancelled = true;
    };
  }, [storage, assetId]);
  return url;
}

/** 사용자 이미지 자산 목록 (kind 'image'). refresh로 다시 읽는다 */
export function useUserImages(storage: Storage): { images: Asset[]; refresh: () => Promise<void> } {
  const [images, setImages] = useState<Asset[]>([]);
  const refresh = async () => {
    const list = await storage.assets.list('image');
    list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    setImages(list);
  };
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storage]);
  return { images, refresh };
}

/** 스티커 참조가 가리키는 팩 정의 (사용자 이미지면 undefined) */
export function packStickerOf(assetId: string): StickerDef | undefined {
  return isPackAssetId(assetId) ? getPackSticker(assetId) : undefined;
}
