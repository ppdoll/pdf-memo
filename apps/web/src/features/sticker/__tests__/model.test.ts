import type { ImageObject, PageSize } from '@pdf-memo/shared';
import { describe, expect, it } from 'vitest';
import {
  STICKER_DEFAULT_SIZE,
  createImageObject,
  defaultStickerSize,
  imageBBox,
  normalizeRotation,
  pdfAnchors,
  withImageGeometry,
} from '../model';

const DOC_ID = '01a0c69a-b833-7434-b143-ea94aec704b7';
const PAGE: PageSize = { w: 612, h: 792, rotation: 0 };
const PACK = { assetId: 'pack:basic/heart-red', width: 100, height: 100 };
const TAPE = { assetId: 'pack:basic/tape-pink', width: 100, height: 28 };
const PHOTO = { assetId: 'a'.repeat(64), width: 1024, height: 768 };

describe('normalizeRotation', () => {
  it('maps into (-180, 180]', () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(190)).toBe(-170);
    expect(normalizeRotation(-190)).toBe(170);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(-180)).toBe(180);
    expect(normalizeRotation(720 + 45)).toBe(45);
  });
});

describe('imageBBox', () => {
  it('equals the rect when not rotated and swaps sides at 90 degrees', () => {
    expect(imageBBox({ x: 10, y: 20, w: 40, h: 20, rotation: 0 })).toEqual([10, 20, 40, 20]);
    expect(imageBBox({ x: 10, y: 20, w: 40, h: 20, rotation: 90 })).toEqual([20, 10, 20, 40]);
  });

  it('grows symmetrically around the centre for other angles', () => {
    const [x, y, w, h] = imageBBox({ x: 0, y: 0, w: 100, h: 100, rotation: 45 });
    expect(w).toBeCloseTo(141.42, 1);
    expect(h).toBeCloseTo(141.42, 1);
    expect(x + w / 2).toBeCloseTo(50, 5);
    expect(y + h / 2).toBeCloseTo(50, 5);
  });
});

describe('defaultStickerSize / createImageObject', () => {
  it('uses 64pt for pack stickers, keeps the aspect ratio and centres on the tap', () => {
    expect(defaultStickerSize(PACK, PAGE)).toEqual({ w: STICKER_DEFAULT_SIZE, h: 64 });
    expect(defaultStickerSize(TAPE, PAGE)).toEqual({ w: 64, h: 17.92 });
    const photo = defaultStickerSize(PHOTO, PAGE);
    expect(photo.w).toBe(160);
    expect(photo.h).toBe(120);

    const object = createImageObject(DOC_ID, 2, 7, { x: 300, y: 400 }, PACK, PAGE);
    expect(object.type).toBe('image');
    expect(object.assetId).toBe(PACK.assetId);
    expect(object.x + object.w / 2).toBe(300);
    expect(object.y + object.h / 2).toBe(400);
    expect(object.bbox).toEqual([268, 368, 64, 64]);
    expect(object).toMatchObject({ pageIndex: 2, z: 7, rotation: 0, opacity: 1, repeat: 'none' });
  });

  it('shrinks large defaults on small pages', () => {
    const small: PageSize = { w: 100, h: 80, rotation: 0 };
    const size = defaultStickerSize(PHOTO, small);
    expect(size.w).toBeLessThanOrEqual(50);
    expect(size.h).toBeLessThanOrEqual(40);
    expect(size.h / size.w).toBeCloseTo(0.75, 2);
  });
});

describe('withImageGeometry', () => {
  const base: ImageObject = createImageObject(DOC_ID, 0, 1, { x: 100, y: 100 }, PACK, PAGE);

  it('keeps the centre inside the page and enforces a minimum size', () => {
    const moved = withImageGeometry(base, { x: -500, y: 900 }, PAGE);
    expect(moved.x + moved.w / 2).toBe(0);
    expect(moved.y + moved.h / 2).toBe(PAGE.h);
    const tiny = withImageGeometry(base, { w: 1, h: 1 }, PAGE);
    expect(tiny.w).toBe(12);
    expect(tiny.h).toBe(12);
  });

  it('normalises rotation and refreshes the bbox', () => {
    const rotated = withImageGeometry(base, { rotation: 450 }, PAGE);
    expect(rotated.rotation).toBe(90);
    expect(rotated.bbox).toEqual(imageBBox(rotated));
  });
});

describe('pdfAnchors', () => {
  const origin = { x: 10, y: 800 };

  it('places the unrotated image at its bottom-left and svg at its top-left', () => {
    const anchors = pdfAnchors({ x: 100, y: 200, w: 60, h: 40, rotation: 0 }, origin);
    expect(anchors.rotateDeg).toBe(0);
    expect(anchors.image.x).toBeCloseTo(110);
    expect(anchors.image.y).toBeCloseTo(800 - 240);
    expect(anchors.svg.x).toBeCloseTo(110);
    expect(anchors.svg.y).toBeCloseTo(800 - 200);
  });

  it('rotates around the centre: a 90 degree clockwise sticker keeps its centre', () => {
    const g = { x: 100, y: 200, w: 60, h: 40, rotation: 90 };
    const anchors = pdfAnchors(g, origin);
    expect(anchors.rotateDeg).toBe(-90);
    // 중심 (140, 580). 회전 후 이미지의 좌하단 기준점은 중심에서 (-h/2, +w/2) 만큼
    expect(anchors.image.x).toBeCloseTo(140 - 20);
    expect(anchors.image.y).toBeCloseTo(580 + 30);
    // SVG 좌상단 기준점은 중심에서 (+h/2, +w/2)
    expect(anchors.svg.x).toBeCloseTo(140 + 20);
    expect(anchors.svg.y).toBeCloseTo(580 + 30);
  });
});
