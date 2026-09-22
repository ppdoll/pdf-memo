import type { PageSize } from '@pdf-memo/shared';

/**
 * 좌표계
 * - 페이지 공간: PDF pt, 원점 좌상단, 회전 0, 배율 1 (저장 단위)
 * - 화면 공간: 페이지 박스 안의 CSS px, 회전(page.rotate) 적용
 * 두 공간 사이 변환은 pdf.js 없이 순수 계산한다. 회전은 시계 방향(pdf.js와 동일).
 */

export interface Point {
  x: number;
  y: number;
}

/** 2D 아핀 행렬 (x' = a·x + c·y + e, y' = b·x + d·y + f) */
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export function pageToDisplayMatrix(size: PageSize, scale: number): Matrix {
  const s = scale;
  switch (size.rotation) {
    case 90:
      return { a: 0, b: s, c: -s, d: 0, e: s * size.h, f: 0 };
    case 180:
      return { a: -s, b: 0, c: 0, d: -s, e: s * size.w, f: s * size.h };
    case 270:
      return { a: 0, b: -s, c: s, d: 0, e: 0, f: s * size.w };
    default:
      return { a: s, b: 0, c: 0, d: s, e: 0, f: 0 };
  }
}

export function applyMatrix(m: Matrix, p: Point): Point {
  return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
}

/** 화면(CSS px) → 페이지 공간(pt) */
export function displayToPage(p: Point, size: PageSize, scale: number): Point {
  const s = scale;
  switch (size.rotation) {
    case 90:
      return { x: p.y / s, y: size.h - p.x / s };
    case 180:
      return { x: size.w - p.x / s, y: size.h - p.y / s };
    case 270:
      return { x: size.w - p.y / s, y: p.x / s };
    default:
      return { x: p.x / s, y: p.y / s };
  }
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 점 p와 선분 ab 사이의 최단 거리 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * 잉크 스트로크가 반지름 radius인 원(중심 p)에 닿는지.
 * points는 [x, y, pressure, ...] 평면 배열, 굵기의 절반을 허용 오차에 더한다.
 */
export function inkHit(
  points: readonly number[],
  strokeWidth: number,
  p: Point,
  radius: number,
): boolean {
  const tolerance = radius + strokeWidth / 2;
  if (points.length < 3) return false;
  if (points.length === 3) {
    return distance(p, { x: points[0], y: points[1] }) <= tolerance;
  }
  for (let i = 0; i + 4 < points.length; i += 3) {
    const a = { x: points[i], y: points[i + 1] };
    const b = { x: points[i + 3], y: points[i + 4] };
    if (distanceToSegment(p, a, b) <= tolerance) return true;
  }
  return false;
}

/** 저장 용량을 줄이기 위한 반올림 (좌표 소수 2자리, 압력 3자리) */
export function roundInkPoints(points: readonly number[]): number[] {
  return points.map((v, i) =>
    i % 3 === 2 ? Math.round(v * 1000) / 1000 : Math.round(v * 100) / 100,
  );
}
