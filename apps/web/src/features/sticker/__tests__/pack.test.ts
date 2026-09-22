import { describe, expect, it } from 'vitest';
import {
  PACK_PREFIX,
  STICKER_CATEGORIES,
  STICKER_PACK,
  getPackSticker,
  isPackAssetId,
} from '../pack';
import { arcPath, circlePath, heartPath, starPath } from '../paths';

/** M/L/C/Z 명령과 숫자만 허용 (pdf-lib drawSvgPath와 SVG가 같은 결과를 내도록 호 명령은 쓰지 않는다) */
const SAFE_PATH = /^[MLCZ][\d\s.\-MLCZ]*$/;

describe('sticker pack', () => {
  it('has unique prefixed ids, a known category and drawable shapes', () => {
    const ids = new Set<string>();
    const categories = new Set(STICKER_CATEGORIES.map((c) => c.id));
    for (const sticker of STICKER_PACK) {
      expect(sticker.id.startsWith(PACK_PREFIX)).toBe(true);
      expect(ids.has(sticker.id)).toBe(false);
      ids.add(sticker.id);
      expect(categories.has(sticker.category)).toBe(true);
      expect(sticker.width).toBeGreaterThan(0);
      expect(sticker.height).toBeGreaterThan(0);
      expect(sticker.shapes.length).toBeGreaterThan(0);
      for (const shape of sticker.shapes) {
        expect(shape.d).toMatch(SAFE_PATH);
        expect(Boolean(shape.fill) || Boolean(shape.stroke)).toBe(true);
        if (shape.opacity !== undefined) {
          expect(shape.opacity).toBeGreaterThan(0);
          expect(shape.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
    expect(STICKER_PACK.length).toBeGreaterThanOrEqual(24);
  });

  it('looks stickers up by asset id', () => {
    expect(isPackAssetId('pack:basic/heart-red')).toBe(true);
    expect(isPackAssetId('a'.repeat(64))).toBe(false);
    expect(getPackSticker('pack:basic/heart-red')?.name).toBe('빨간 하트');
    expect(getPackSticker('pack:basic/nope')).toBeUndefined();
  });
});

describe('path helpers', () => {
  it('build closed shapes inside the box', () => {
    const numbers = (d: string) => d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
    for (const d of [circlePath(50, 50, 40), heartPath(50, 52, 40), starPath(50, 50, 5, 45, 20)]) {
      expect(d.endsWith('Z')).toBe(true);
      for (const n of numbers(d)) {
        expect(n).toBeGreaterThanOrEqual(-1);
        expect(n).toBeLessThanOrEqual(101);
      }
    }
  });

  it('approximates arcs with one cubic per quarter turn', () => {
    const half = arcPath(50, 50, 40, 180, 360);
    expect(half.match(/C/g)?.length).toBe(2);
    expect(half.startsWith('M 10 50')).toBe(true);
    expect(half.endsWith('90 50')).toBe(true);
  });
});
