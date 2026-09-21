import type { BBox } from '../domain/annotation';

export interface Point {
  x: number;
  y: number;
}

/** 페이지 공간(원점 좌상단) → PDF 사용자 공간(원점 좌하단). pdf-lib로 내보낼 때 사용 */
export function pageToPdfUserSpace(p: Point, pageHeight: number): Point {
  return { x: p.x, y: pageHeight - p.y };
}

/** PDF 사용자 공간 → 페이지 공간 */
export function pdfUserSpaceToPage(p: Point, pageHeight: number): Point {
  return { x: p.x, y: pageHeight - p.y };
}

/** 저장 용량을 줄이기 위한 좌표 반올림 (기본 소수 2자리) */
export function roundCoord(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** 평면 포인트 배열([x, y, ...stride], ...)의 경계 상자 */
export function bboxOfPoints(points: readonly number[], stride = 3): BBox {
  if (stride < 2 || points.length < stride) {
    throw new Error('bboxOfPoints: need at least one point');
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < points.length; i += stride) {
    const x = points[i];
    const y = points[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX - minX, maxY - minY];
}

export function bboxUnion(a: BBox, b: BBox): BBox {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  const right = Math.max(a[0] + a[2], b[0] + b[2]);
  const bottom = Math.max(a[1] + a[3], b[1] + b[3]);
  return [x, y, right - x, bottom - y];
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

export function bboxContainsPoint(b: BBox, p: Point): boolean {
  return p.x >= b[0] && p.x <= b[0] + b[2] && p.y >= b[1] && p.y <= b[1] + b[3];
}

/** 굵은 선의 히트 테스트를 위해 상자를 pad만큼 넓힌다 */
export function bboxExpand(b: BBox, pad: number): BBox {
  return [b[0] - pad, b[1] - pad, b[2] + pad * 2, b[3] + pad * 2];
}
