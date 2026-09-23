import type { Matrix } from '../annotate/geometry';
import {
  arrowHeadLocal,
  arrowHeadSize,
  isLinear,
  type ShapeGeometry,
  type ShapeKind,
} from './model';

export interface ShapeStyle {
  kind: ShapeKind;
  stroke: string;
  strokeWidth: number;
  fill: string | null;
  dash: readonly number[] | null;
}

/**
 * 끌어서 만드는 동안의 미리보기를 캔버스에 그린다. 좌표는 페이지 공간이고 행렬로 화면에 맞춘다.
 * 확정된 도형은 ShapeLayer(SVG)가 그린다.
 */
export function drawShapeOnCanvas(
  ctx: CanvasRenderingContext2D,
  style: ShapeStyle,
  g: ShapeGeometry,
  matrix: Matrix,
  dpr: number,
): void {
  ctx.save();
  ctx.setTransform(
    matrix.a * dpr,
    matrix.b * dpr,
    matrix.c * dpr,
    matrix.d * dpr,
    matrix.e * dpr,
    matrix.f * dpr,
  );
  ctx.lineWidth = style.strokeWidth;
  ctx.strokeStyle = style.stroke;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.setLineDash(style.dash ? [...style.dash] : []);

  if (isLinear(style.kind)) {
    ctx.translate(g.x, g.y);
    ctx.rotate((g.rotation * Math.PI) / 180);
    const head = style.kind === 'arrow' ? arrowHeadSize(style.strokeWidth) : 0;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.max(0, g.w - head * 0.6), 0);
    ctx.stroke();
    if (style.kind === 'arrow') {
      const [tip, left, right] = arrowHeadLocal(g.w, style.strokeWidth);
      ctx.setLineDash([]);
      ctx.fillStyle = style.stroke;
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(left.x, left.y);
      ctx.lineTo(right.x, right.y);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    return;
  }

  ctx.translate(g.x + g.w / 2, g.y + g.h / 2);
  ctx.rotate((g.rotation * Math.PI) / 180);
  ctx.beginPath();
  if (style.kind === 'rect') {
    ctx.rect(-g.w / 2, -g.h / 2, g.w, g.h);
  } else {
    ctx.ellipse(0, 0, g.w / 2, g.h / 2, 0, 0, Math.PI * 2);
  }
  if (style.fill) {
    ctx.fillStyle = style.fill;
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}
