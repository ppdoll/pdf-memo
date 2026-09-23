import type { PageSize, ShapeObject } from '@pdf-memo/shared';
import { describe, expect, it } from 'vitest';
import {
  SHAPE_DEFAULT_BOX,
  SHAPE_DEFAULT_LENGTH,
  createShapeObject,
  geometryFromDrag,
  lineEndpoints,
  lineFromEndpoints,
  shapeHit,
  withShapeGeometry,
  type ShapeDefaults,
} from '../model';

const DOC_ID = '01a0c69a-b833-7434-b143-ea94aec704b7';
const PAGE: PageSize = { w: 612, h: 792, rotation: 0 };
const defaults: ShapeDefaults = {
  kind: 'rect',
  stroke: '#ef4444',
  strokeWidth: 2,
  fill: null,
  dashed: false,
};

describe('lines', () => {
  it('round-trips endpoints through length and angle', () => {
    const g = lineFromEndpoints({ x: 10, y: 10 }, { x: 10, y: 110 });
    expect(g).toMatchObject({ x: 10, y: 10, w: 100, h: 0, rotation: 90 });
    const { start, end } = lineEndpoints(g);
    expect(start).toEqual({ x: 10, y: 10 });
    expect(end.x).toBeCloseTo(10, 5);
    expect(end.y).toBeCloseTo(110, 5);
    expect(lineFromEndpoints({ x: 0, y: 0 }, { x: -50, y: 0 }).rotation).toBe(180);
  });

  it('gives arrows a bbox that covers the head', () => {
    const arrow = createShapeObject(
      DOC_ID,
      0,
      1,
      lineFromEndpoints({ x: 100, y: 100 }, { x: 200, y: 100 }),
      { ...defaults, kind: 'arrow', strokeWidth: 2 },
    );
    const [x, y, w, h] = arrow.bbox;
    expect(x).toBeLessThan(100);
    expect(x + w).toBeGreaterThan(200);
    expect(h).toBeGreaterThan(4);
    expect(y).toBeLessThan(100);
    expect(arrow.fill).toBeNull();
  });
});

describe('geometryFromDrag', () => {
  it('turns a tap into a default-sized shape centred on the point', () => {
    const box = geometryFromDrag('rect', { x: 200, y: 300 }, { x: 201, y: 301 });
    expect(box).toEqual({
      x: 200 - SHAPE_DEFAULT_BOX.w / 2,
      y: 300 - SHAPE_DEFAULT_BOX.h / 2,
      w: SHAPE_DEFAULT_BOX.w,
      h: SHAPE_DEFAULT_BOX.h,
      rotation: 0,
    });
    const line = geometryFromDrag('line', { x: 200, y: 300 }, { x: 200, y: 300 });
    expect(line.w).toBe(SHAPE_DEFAULT_LENGTH);
    expect(line.rotation).toBe(0);
    expect(line.x).toBe(200 - SHAPE_DEFAULT_LENGTH / 2);
  });

  it('normalises dragged boxes and keeps line direction', () => {
    expect(geometryFromDrag('ellipse', { x: 300, y: 200 }, { x: 100, y: 260 })).toEqual({
      x: 100,
      y: 200,
      w: 200,
      h: 60,
      rotation: 0,
    });
    const arrow = geometryFromDrag('arrow', { x: 0, y: 0 }, { x: 30, y: 40 });
    expect(arrow.w).toBe(50);
    expect(arrow.rotation).toBeCloseTo(53.13, 1);
  });
});

describe('shapeBBox / withShapeGeometry', () => {
  const rect = createShapeObject(
    DOC_ID,
    0,
    1,
    { x: 100, y: 100, w: 80, h: 40, rotation: 0 },
    { ...defaults, strokeWidth: 4 },
  );

  it('pads the bbox by half the stroke and follows rotation', () => {
    expect(rect.bbox).toEqual([98, 98, 84, 44]);
    const rotated = withShapeGeometry(rect, { rotation: 90 }, PAGE);
    expect(rotated.bbox[2]).toBeCloseTo(44, 5);
    expect(rotated.bbox[3]).toBeCloseTo(84, 5);
    expect(rotated.bbox[0] + rotated.bbox[2] / 2).toBeCloseTo(140, 5);
  });

  it('keeps the centre on the page, enforces minimum size and updates stroke width', () => {
    const moved = withShapeGeometry(rect, { x: -1000, y: 5000, w: 1, h: 1 }, PAGE);
    expect(moved.w).toBe(4);
    expect(moved.h).toBe(4);
    expect(moved.x + moved.w / 2).toBe(0);
    expect(moved.y + moved.h / 2).toBe(PAGE.h);
    const thick = withShapeGeometry(rect, { strokeWidth: 10 }, PAGE);
    expect(thick.strokeWidth).toBe(10);
    expect(thick.bbox).toEqual([95, 95, 90, 50]);
  });
});

describe('shapeHit', () => {
  const outlined: ShapeObject = createShapeObject(
    DOC_ID,
    0,
    1,
    { x: 100, y: 100, w: 100, h: 60, rotation: 0 },
    defaults,
  );
  const filled: ShapeObject = { ...outlined, fill: '#fef08a' };
  const ellipse: ShapeObject = { ...outlined, shape: 'ellipse' };
  const line = createShapeObject(
    DOC_ID,
    0,
    1,
    lineFromEndpoints({ x: 0, y: 0 }, { x: 100, y: 0 }),
    { ...defaults, kind: 'line' },
  );

  it('hits outlines near the edge but not deep inside unless filled', () => {
    expect(shapeHit(outlined, { x: 100, y: 130 }, 4)).toBe(true);
    expect(shapeHit(outlined, { x: 150, y: 130 }, 4)).toBe(false);
    expect(shapeHit(filled, { x: 150, y: 130 }, 4)).toBe(true);
    expect(shapeHit(outlined, { x: 300, y: 300 }, 4)).toBe(false);
  });

  it('handles ellipses and lines', () => {
    expect(shapeHit(ellipse, { x: 200, y: 130 }, 4)).toBe(true);
    expect(shapeHit(ellipse, { x: 150, y: 130 }, 4)).toBe(false);
    expect(shapeHit({ ...ellipse, fill: '#ffffff' }, { x: 150, y: 130 }, 4)).toBe(true);
    expect(shapeHit(line, { x: 50, y: 3 }, 4)).toBe(true);
    expect(shapeHit(line, { x: 50, y: 20 }, 4)).toBe(false);
  });
});
