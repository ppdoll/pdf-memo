import type { PageSize } from '@pdf-memo/shared';
import { describe, expect, it } from 'vitest';
import {
  applyMatrix,
  displayToPage,
  distanceToSegment,
  inkHit,
  pageToDisplayMatrix,
  roundInkPoints,
} from '../geometry';

const size: PageSize = { w: 612, h: 792, rotation: 0 };

describe('page <-> display transforms', () => {
  it.each([0, 90, 180, 270] as const)('round-trips points at rotation %s', (rotation) => {
    const s: PageSize = { ...size, rotation };
    const m = pageToDisplayMatrix(s, 1.5);
    for (const p of [
      { x: 0, y: 0 },
      { x: 612, y: 0 },
      { x: 0, y: 792 },
      { x: 123.4, y: 456.7 },
    ]) {
      const display = applyMatrix(m, p);
      const back = displayToPage(display, s, 1.5);
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });

  it('rotates 90 degrees clockwise like pdf.js (top-left corner ends at top-right)', () => {
    const m = pageToDisplayMatrix({ ...size, rotation: 90 }, 1);
    expect(applyMatrix(m, { x: 0, y: 0 })).toEqual({ x: 792, y: 0 });
    expect(applyMatrix(m, { x: 612, y: 0 })).toEqual({ x: 792, y: 612 });
    expect(applyMatrix(m, { x: 0, y: 792 })).toEqual({ x: 0, y: 0 });
  });

  it('keeps display coordinates inside the rotated box', () => {
    const m = pageToDisplayMatrix({ ...size, rotation: 270 }, 2);
    const corner = applyMatrix(m, { x: 612, y: 792 });
    expect(corner).toEqual({ x: 1584, y: 0 });
  });
});

describe('hit testing', () => {
  it('measures distance to a segment including the end caps', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 10, y: 0 };
    expect(distanceToSegment({ x: 5, y: 3 }, a, b)).toBe(3);
    expect(distanceToSegment({ x: -4, y: 0 }, a, b)).toBe(4);
    expect(distanceToSegment({ x: 13, y: 4 }, a, b)).toBe(5);
    expect(distanceToSegment({ x: 1, y: 1 }, a, a)).toBeCloseTo(Math.SQRT2);
  });

  it('detects whether an eraser circle touches an ink stroke', () => {
    const points = [0, 0, 0.5, 10, 0, 0.5, 20, 10, 0.5];
    expect(inkHit(points, 2, { x: 5, y: 2 }, 1)).toBe(true);
    expect(inkHit(points, 2, { x: 5, y: 5 }, 1)).toBe(false);
    expect(inkHit(points, 2, { x: 15, y: 5 }, 0.5)).toBe(true);
    expect(inkHit([3, 3, 0.5], 4, { x: 4, y: 4 }, 0)).toBe(true);
    expect(inkHit([], 4, { x: 4, y: 4 }, 10)).toBe(false);
  });

  it('rounds coordinates to 2 decimals and pressure to 3', () => {
    expect(roundInkPoints([1.23456, 2.34567, 0.123456])).toEqual([1.23, 2.35, 0.123]);
  });
});
