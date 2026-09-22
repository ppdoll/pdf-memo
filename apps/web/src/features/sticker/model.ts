import {
  ANNOTATION_SCHEMA_VERSION,
  createEntityBase,
  type BBox,
  type ImageObject,
  type PageSize,
} from '@pdf-memo/shared';

/** 내장 스티커의 기본 폭 (pt) */
export const STICKER_DEFAULT_SIZE = 64;
/** 사용자 이미지의 기본 폭 (pt) */
export const USER_IMAGE_DEFAULT_WIDTH = 160;
export const STICKER_MIN_SIZE = 12;
/** 최근 사용 목록 길이 */
export const RECENT_STICKERS_MAX = 12;
export const STICKER_OPACITIES = [1, 0.7, 0.4] as const;

/** 붙일 스티커: 자산 id와 원본 비율(뷰박스 또는 픽셀 크기) */
export interface StickerRef {
  assetId: string;
  width: number;
  height: number;
}

export interface ImageGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** 회전각을 (-180, 180]로 정규화 */
export function normalizeRotation(deg: number): number {
  let r = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (r === -180) r = 180;
  return round2(r);
}

/** 회전한 사각형의 축 정렬 경계 상자 (페이지 공간) */
export function imageBBox(g: ImageGeometry): BBox {
  const rad = (g.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const hw = (g.w * cos + g.h * sin) / 2;
  const hh = (g.w * sin + g.h * cos) / 2;
  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  return [round2(cx - hw), round2(cy - hh), round2(hw * 2), round2(hh * 2)];
}

/** 새 스티커의 기본 크기: 팩 스티커는 64pt, 사진은 160pt 폭 (페이지 폭의 절반 이하) */
export function defaultStickerSize(ref: StickerRef, pageSize: PageSize): { w: number; h: number } {
  const aspect = ref.height / ref.width;
  const isPack = ref.assetId.startsWith('pack:');
  const base = isPack ? STICKER_DEFAULT_SIZE : USER_IMAGE_DEFAULT_WIDTH;
  let w = Math.min(base, pageSize.w / 2);
  let h = w * aspect;
  if (h > pageSize.h / 2) {
    h = pageSize.h / 2;
    w = h / aspect;
  }
  return { w: round2(w), h: round2(h) };
}

/** 중심을 페이지 안에 두도록 기하를 다듬고 bbox를 다시 계산한다 */
export function withImageGeometry(
  image: ImageObject,
  patch: Partial<ImageGeometry>,
  pageSize: PageSize,
): ImageObject {
  const w = clamp(patch.w ?? image.w, STICKER_MIN_SIZE, pageSize.w * 2);
  const h = clamp(
    patch.h ?? image.h,
    STICKER_MIN_SIZE * (image.h / Math.max(image.w, 1)),
    pageSize.h * 2,
  );
  const rotation = normalizeRotation(patch.rotation ?? image.rotation);
  const cx = clamp((patch.x ?? image.x) + w / 2, 0, pageSize.w);
  const cy = clamp((patch.y ?? image.y) + h / 2, 0, pageSize.h);
  const x = round2(cx - w / 2);
  const y = round2(cy - h / 2);
  const geometry = { x, y, w: round2(w), h: round2(h), rotation };
  return { ...image, ...geometry, bbox: imageBBox(geometry) };
}

/** 탭한 자리를 중심으로 스티커를 만든다 */
export function createImageObject(
  documentId: string,
  pageIndex: number,
  z: number,
  center: { x: number; y: number },
  ref: StickerRef,
  pageSize: PageSize,
): ImageObject {
  const { w, h } = defaultStickerSize(ref, pageSize);
  const geometry: ImageGeometry = {
    x: round2(center.x - w / 2),
    y: round2(center.y - h / 2),
    w,
    h,
    rotation: 0,
  };
  return {
    ...createEntityBase(),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    documentId,
    pageIndex,
    z,
    bbox: imageBBox(geometry),
    locked: false,
    type: 'image',
    assetId: ref.assetId,
    ...geometry,
    opacity: 1,
    repeat: 'none',
    flipX: false,
    flipY: false,
  };
}

export interface PdfAnchors {
  /** 회전 각도 (PDF 규약: 반시계 양수) */
  rotateDeg: number;
  /** drawImage용: 회전 전 좌하단 모서리가 회전 후 놓이는 자리 */
  image: { x: number; y: number };
  /** drawSvgPath용: 회전 전 좌상단 모서리가 회전 후 놓이는 자리 */
  svg: { x: number; y: number };
}

/**
 * 페이지 공간(y 아래, 화면 시계 방향 회전)의 스티커를 PDF 좌표(y 위)로 옮긴다.
 * pdf-lib은 (x, y) 기준점을 축으로 회전하므로, 중심을 축으로 회전한 결과가 되도록 기준점을 미리 계산한다.
 * origin은 CropBox 좌상단의 PDF 좌표.
 */
export function pdfAnchors(g: ImageGeometry, origin: { x: number; y: number }): PdfAnchors {
  const cx = origin.x + g.x + g.w / 2;
  const cy = origin.y - (g.y + g.h / 2);
  const theta = (-g.rotation * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const hw = g.w / 2;
  const hh = g.h / 2;
  return {
    rotateDeg: g.rotation === 0 ? 0 : -g.rotation,
    image: { x: cx + (-hw * cos + hh * sin), y: cy + (-hw * sin - hh * cos) },
    svg: { x: cx + (-hw * cos - hh * sin), y: cy + (-hw * sin + hh * cos) },
  };
}
