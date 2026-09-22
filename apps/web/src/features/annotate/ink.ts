import type { InkObject, InkTool } from '@pdf-memo/shared';
import { getStroke, type StrokeOptions } from 'perfect-freehand';
import type { Matrix } from './geometry';

/** 렌더에 필요한 최소 필드. 그리는 중인 스트로크도 이 형태로 미리 그린다 */
export type InkLike = Pick<
  InkObject,
  'tool' | 'color' | 'opacity' | 'width' | 'points' | 'smoothing'
>;

export interface ToolProfile {
  thinning: number;
  smoothing: number;
  streamline: number;
  opacity: number;
}

/** 도구별 perfect-freehand 파라미터. 스트로크에 스냅샷으로 저장되므로 나중에 바꿔도 기존 필기는 그대로다 */
export const TOOL_PROFILES: Record<InkTool, ToolProfile> = {
  pen: { thinning: 0.6, smoothing: 0.5, streamline: 0.5, opacity: 1 },
  highlighter: { thinning: 0, smoothing: 0.5, streamline: 0.4, opacity: 0.9 },
  marker: { thinning: 0, smoothing: 0.5, streamline: 0.4, opacity: 1 },
};

/** 마우스처럼 압력이 일정하면 속도 기반 압력을 흉내 낸다 */
export function needsSimulatedPressure(points: readonly number[]): boolean {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 2; i < points.length; i += 3) {
    if (points[i] < min) min = points[i];
    if (points[i] > max) max = points[i];
  }
  return !(max - min > 0.05);
}

export function pointsToTriples(points: readonly number[]): number[][] {
  const triples: number[][] = [];
  for (let i = 0; i + 2 < points.length; i += 3) {
    triples.push([points[i], points[i + 1], points[i + 2]]);
  }
  return triples;
}

export function inkStrokeOptions(ink: InkLike, last = true): StrokeOptions {
  return {
    size: ink.width,
    thinning: ink.smoothing.thinning,
    smoothing: ink.smoothing.smoothing,
    streamline: ink.smoothing.streamline,
    simulatePressure: needsSimulatedPressure(ink.points),
    last,
  };
}

/** 페이지 공간(pt)의 외곽선 폴리곤. 배율과 무관해서 어느 줌에서도 같은 모양이다 */
export function inkOutline(ink: InkLike, last = true): number[][] {
  const triples = pointsToTriples(ink.points);
  if (triples.length === 0) return [];
  if (triples.length === 1) triples.push([...triples[0]]);
  return getStroke(triples, inkStrokeOptions(ink, last));
}

export function outlineToPath(outline: number[][]): Path2D {
  const path = new Path2D();
  if (outline.length < 2) return path;
  path.moveTo(outline[0][0], outline[0][1]);
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    path.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
  }
  path.closePath();
  return path;
}

/** 페이지 공간 좌표의 잉크를 화면 행렬·DPR을 적용해 캔버스에 채운다 */
export function drawInk(
  ctx: CanvasRenderingContext2D,
  ink: InkLike,
  matrix: Matrix,
  dpr: number,
  last = true,
): void {
  const outline = inkOutline(ink, last);
  if (outline.length < 2) return;
  ctx.save();
  ctx.setTransform(
    matrix.a * dpr,
    matrix.b * dpr,
    matrix.c * dpr,
    matrix.d * dpr,
    matrix.e * dpr,
    matrix.f * dpr,
  );
  ctx.globalAlpha = ink.opacity;
  ctx.fillStyle = ink.color;
  ctx.fill(outlineToPath(outline));
  ctx.restore();
}

/** 캔버스 비트맵을 CSS 크기 × DPR로 맞춘다. 크기가 같으면 건드리지 않는다(내용 유지) */
export function sizeCanvas(
  canvas: HTMLCanvasElement,
  cssWidth: number,
  cssHeight: number,
  dpr: number,
): void {
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}
