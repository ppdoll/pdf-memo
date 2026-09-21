import { describe, expect, it } from 'vitest';
import {
  bboxContainsPoint,
  bboxExpand,
  bboxIntersects,
  bboxOfPoints,
  bboxUnion,
  pageToPdfUserSpace,
  pdfUserSpaceToPage,
  roundCoord,
} from '../coords';

describe('coordinate conversion', () => {
  it('flips y against page height and is its own inverse', () => {
    const p = { x: 10, y: 30 };
    const pdf = pageToPdfUserSpace(p, 842);
    expect(pdf).toEqual({ x: 10, y: 812 });
    expect(pdfUserSpaceToPage(pdf, 842)).toEqual(p);
  });

  it('rounds to two decimals by default', () => {
    expect(roundCoord(1.23456)).toBe(1.23);
    expect(roundCoord(1.235, 1)).toBe(1.2);
  });
});

describe('bbox helpers', () => {
  it('computes bbox over [x, y, pressure] triples', () => {
    expect(bboxOfPoints([1, 2, 0.5, 5, 8, 0.5, 3, 1, 0.5])).toEqual([1, 1, 4, 7]);
  });

  it('throws on empty input', () => {
    expect(() => bboxOfPoints([])).toThrow();
  });

  it('union, intersects, contains, expand', () => {
    expect(bboxUnion([0, 0, 2, 2], [1, 1, 4, 1])).toEqual([0, 0, 5, 2]);
    expect(bboxIntersects([0, 0, 2, 2], [1, 1, 2, 2])).toBe(true);
    expect(bboxIntersects([0, 0, 2, 2], [3, 3, 1, 1])).toBe(false);
    expect(bboxContainsPoint([0, 0, 2, 2], { x: 2, y: 2 })).toBe(true);
    expect(bboxContainsPoint([0, 0, 2, 2], { x: 2.1, y: 2 })).toBe(false);
    expect(bboxExpand([1, 1, 2, 2], 1)).toEqual([0, 0, 4, 4]);
  });
});
