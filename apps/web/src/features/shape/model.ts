import {
  ANNOTATION_SCHEMA_VERSION,
  createEntityBase,
  type BBox,
  type PageSize,
  type ShapeObject,
} from '@pdf-memo/shared';
import { distanceToSegment, type Point } from '../annotate/geometry';

export type ShapeKind = ShapeObject['shape'];

export interface ShapeDefaults {
  kind: ShapeKind;
  stroke: string;
  strokeWidth: number;
  /** null = 채우지 않음 */
  fill: string | null;
  dashed: boolean;
}

export interface ShapeGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 사각형·타원: 중심 기준 회전(도, 화면 시계 방향). 선·화살표: 진행 방향 */
  rotation: number;
}

export const SHAPE_KINDS: ReadonlyArray<{ kind: ShapeKind; label: string; glyph: string }> = [
  { kind: 'rect', label: '사각형', glyph: '▭' },
  { kind: 'ellipse', label: '타원', glyph: '◯' },
  { kind: 'line', label: '선', glyph: '╲' },
  { kind: 'arrow', label: '화살표', glyph: '→' },
];
export const SHAPE_WIDTHS = [1, 2, 3.5, 6] as const;
export const SHAPE_FILLS = [
  '#fef08a',
  '#bbf7d0',
  '#bfdbfe',
  '#fbcfe8',
  '#e9d5ff',
  '#ffffff',
] as const;
/** 점선 패턴 (pt) */
export const SHAPE_DASH: readonly number[] = [6, 4];
/** 이보다 짧게 끌면 탭으로 보고 기본 크기로 만든다 */
export const SHAPE_MIN_SIZE = 4;
export const SHAPE_DEFAULT_BOX = { w: 120, h: 80 } as const;
export const SHAPE_DEFAULT_LENGTH = 120;

const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

export function isLinear(kind: ShapeKind): boolean {
  return kind === 'line' || kind === 'arrow';
}

export function normalizeAngle(deg: number): number {
  let r = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (r === -180) r = 180;
  return round2(r);
}

/** 화살촉 길이 (pt). 선 굵기에 비례하되 너무 작지 않게 */
export function arrowHeadSize(strokeWidth: number): number {
  return Math.max(9, strokeWidth * 4);
}

/** 점을 중심 기준으로 회전 (도, 화면 시계 방향) */
export function rotatePoint(p: Point, center: Point, deg: number): Point {
  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

/** 선·화살표의 양 끝점. (x, y)가 시작점, w가 길이, rotation이 방향 */
export function lineEndpoints(g: ShapeGeometry): { start: Point; end: Point } {
  const rad = (g.rotation * Math.PI) / 180;
  return {
    start: { x: g.x, y: g.y },
    end: { x: g.x + g.w * Math.cos(rad), y: g.y + g.w * Math.sin(rad) },
  };
}

export function lineFromEndpoints(start: Point, end: Point): ShapeGeometry {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  return {
    x: round2(start.x),
    y: round2(start.y),
    w: round2(Math.hypot(dx, dy)),
    h: 0,
    rotation: normalizeAngle((Math.atan2(dy, dx) * 180) / Math.PI),
  };
}

type ShapeLike = Pick<ShapeObject, 'shape' | 'x' | 'y' | 'w' | 'h' | 'rotation' | 'strokeWidth'>;

/** 회전·선 굵기·화살촉을 포함한 축 정렬 경계 상자 */
export function shapeBBox(s: ShapeLike): BBox {
  const pad = s.strokeWidth / 2 + (s.shape === 'arrow' ? arrowHeadSize(s.strokeWidth) / 2 : 0);
  if (isLinear(s.shape)) {
    const { start, end } = lineEndpoints(s);
    const minX = Math.min(start.x, end.x) - pad;
    const minY = Math.min(start.y, end.y) - pad;
    return [
      round2(minX),
      round2(minY),
      round2(Math.abs(end.x - start.x) + pad * 2),
      round2(Math.abs(end.y - start.y) + pad * 2),
    ];
  }
  const rad = (s.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad));
  const sin = Math.abs(Math.sin(rad));
  const hw = (s.w * cos + s.h * sin) / 2 + pad;
  const hh = (s.w * sin + s.h * cos) / 2 + pad;
  const cx = s.x + s.w / 2;
  const cy = s.y + s.h / 2;
  return [round2(cx - hw), round2(cy - hh), round2(hw * 2), round2(hh * 2)];
}

/**
 * 끌기 시작점·끝점에서 도형 기하를 만든다. 거의 움직이지 않았으면(탭) 기본 크기로,
 * 사각형·타원은 끌어 만든 상자, 선·화살표는 시작점→끝점.
 */
export function geometryFromDrag(kind: ShapeKind, start: Point, end: Point): ShapeGeometry {
  const moved = Math.hypot(end.x - start.x, end.y - start.y) >= SHAPE_MIN_SIZE;
  if (isLinear(kind)) {
    if (!moved) {
      return lineFromEndpoints(
        { x: start.x - SHAPE_DEFAULT_LENGTH / 2, y: start.y },
        { x: start.x + SHAPE_DEFAULT_LENGTH / 2, y: start.y },
      );
    }
    return lineFromEndpoints(start, end);
  }
  if (!moved) {
    return {
      x: round2(start.x - SHAPE_DEFAULT_BOX.w / 2),
      y: round2(start.y - SHAPE_DEFAULT_BOX.h / 2),
      w: SHAPE_DEFAULT_BOX.w,
      h: SHAPE_DEFAULT_BOX.h,
      rotation: 0,
    };
  }
  return {
    x: round2(Math.min(start.x, end.x)),
    y: round2(Math.min(start.y, end.y)),
    w: round2(Math.max(SHAPE_MIN_SIZE, Math.abs(end.x - start.x))),
    h: round2(Math.max(SHAPE_MIN_SIZE, Math.abs(end.y - start.y))),
    rotation: 0,
  };
}

export function createShapeObject(
  documentId: string,
  pageIndex: number,
  z: number,
  geometry: ShapeGeometry,
  defaults: ShapeDefaults,
): ShapeObject {
  const base = {
    shape: defaults.kind,
    ...geometry,
    strokeWidth: defaults.strokeWidth,
  };
  return {
    ...createEntityBase(),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    documentId,
    pageIndex,
    z,
    bbox: shapeBBox(base),
    locked: false,
    type: 'shape',
    shape: defaults.kind,
    ...geometry,
    stroke: defaults.stroke,
    strokeWidth: defaults.strokeWidth,
    fill: isLinear(defaults.kind) ? null : defaults.fill,
    dash: defaults.dashed ? [...SHAPE_DASH] : null,
  };
}

/** 기하·굵기를 바꾸고 bbox를 다시 계산한다. 시작점(선)·중심(상자)은 페이지 안에 둔다 */
export function withShapeGeometry(
  shape: ShapeObject,
  patch: Partial<ShapeGeometry> & { strokeWidth?: number },
  pageSize: PageSize,
): ShapeObject {
  const strokeWidth = patch.strokeWidth ?? shape.strokeWidth;
  let g: ShapeGeometry = {
    x: patch.x ?? shape.x,
    y: patch.y ?? shape.y,
    w: patch.w ?? shape.w,
    h: patch.h ?? shape.h,
    rotation: normalizeAngle(patch.rotation ?? shape.rotation),
  };
  if (isLinear(shape.shape)) {
    g = { ...g, x: clamp(g.x, 0, pageSize.w), y: clamp(g.y, 0, pageSize.h), h: 0 };
    g.w = Math.max(SHAPE_MIN_SIZE, g.w);
  } else {
    g.w = Math.max(SHAPE_MIN_SIZE, g.w);
    g.h = Math.max(SHAPE_MIN_SIZE, g.h);
    const cx = clamp(g.x + g.w / 2, 0, pageSize.w);
    const cy = clamp(g.y + g.h / 2, 0, pageSize.h);
    g.x = cx - g.w / 2;
    g.y = cy - g.h / 2;
  }
  const rounded: ShapeGeometry = {
    x: round2(g.x),
    y: round2(g.y),
    w: round2(g.w),
    h: round2(g.h),
    rotation: g.rotation,
  };
  const next = { ...shape, ...rounded, strokeWidth };
  return { ...next, bbox: shapeBBox(next) };
}

/** 지우개·선택용 히트 테스트. 채움이 없는 상자는 테두리 근처만 맞는다 */
export function shapeHit(shape: ShapeObject, p: Point, radius: number): boolean {
  const pad = radius + shape.strokeWidth / 2;
  if (isLinear(shape.shape)) {
    const { start, end } = lineEndpoints(shape);
    const head = shape.shape === 'arrow' ? arrowHeadSize(shape.strokeWidth) / 2 : 0;
    return distanceToSegment(p, start, end) <= pad + head;
  }
  const center = { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 };
  const local = rotatePoint(p, center, -shape.rotation);
  const lx = local.x - center.x;
  const ly = local.y - center.y;
  const a = shape.w / 2;
  const b = shape.h / 2;
  if (shape.shape === 'rect') {
    const inside = Math.abs(lx) <= a + pad && Math.abs(ly) <= b + pad;
    if (!inside) return false;
    if (shape.fill) return true;
    const deepInside = Math.abs(lx) <= a - pad && Math.abs(ly) <= b - pad;
    return !deepInside;
  }
  // 타원: 정규화 반지름으로 테두리와의 거리를 근사
  const r = Math.hypot(lx / Math.max(a, 0.01), ly / Math.max(b, 0.01));
  const edgeDistance = Math.abs(1 - r) * Math.min(a, b);
  if (shape.fill) return r <= 1 || edgeDistance <= pad;
  return edgeDistance <= pad;
}

/** 화살촉 삼각형 (선 진행 방향 기준 로컬 좌표: 시작점 (0,0), 끝점 (len,0)) */
export function arrowHeadLocal(length: number, strokeWidth: number): [Point, Point, Point] {
  const hs = arrowHeadSize(strokeWidth);
  return [
    { x: length, y: 0 },
    { x: length - hs, y: -hs / 2 },
    { x: length - hs, y: hs / 2 },
  ];
}
