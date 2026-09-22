import { describe, expect, it } from 'vitest';
import { hexToRgb01, outlineToSvgPath } from '../svgPath';

describe('outlineToSvgPath', () => {
  it('emits a closed quadratic path through the outline midpoints', () => {
    const path = outlineToSvgPath([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
    expect(path.startsWith('M 0 0 Q 0 0 5 0 Q 10 0 10 5 Q 10 10 5 5')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path.split('Q').length - 1).toBe(3);
  });

  it('rounds coordinates to two decimals and returns empty for degenerate input', () => {
    expect(
      outlineToSvgPath([
        [1.23456, 2.34567],
        [3, 4],
      ]),
    ).toContain('M 1.23 2.35');
    expect(outlineToSvgPath([[1, 1]])).toBe('');
    expect(outlineToSvgPath([])).toBe('');
  });
});

describe('hexToRgb01', () => {
  it('parses #RRGGBB into 0..1 components and falls back to black', () => {
    expect(hexToRgb01('#ff8000')).toEqual({ r: 1, g: 128 / 255, b: 0 });
    expect(hexToRgb01('#1F2937').r).toBeCloseTo(31 / 255);
    expect(hexToRgb01('red')).toEqual({ r: 0, g: 0, b: 0 });
  });
});
