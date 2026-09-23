import type { AnnotationObject, PageSize, ShapeObject } from '@pdf-memo/shared';
import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { displayToPage, type Matrix, type Point } from '../annotate/geometry';
import type { AnnotationSession } from '../annotate/session';
import { useToolStore } from '../annotate/toolStore';
import { useSelectionStore } from '../text/selectionStore';
import {
  arrowHeadLocal,
  arrowHeadSize,
  isLinear,
  lineEndpoints,
  lineFromEndpoints,
  normalizeAngle,
  rotatePoint,
  withShapeGeometry,
  type ShapeGeometry,
} from './model';

const DRAG_THRESHOLD_PX = 4;
const SNAP_DEG = 5;
const HANDLE_PX = 10;
const ROTATE_OFFSET_PX = 26;
/** 손가락으로도 잡기 쉽게 보이지 않는 넓은 히트 영역 (px) */
const HIT_PX = 14;

type DragKind = 'move' | 'resize' | 'rotate' | 'start' | 'end';

interface DragState {
  pointerId: number;
  kind: DragKind;
  startClient: Point;
  start: Point;
  startObject: ShapeObject;
  moved: boolean;
  live: ShapeGeometry;
}

interface ShapeLayerProps {
  session: AnnotationSession;
  pageIndex: number;
  pageSize: PageSize;
  scale: number;
  matrix: Matrix;
  objects: readonly AnnotationObject[];
  interactive: boolean;
}

type Handlers = {
  begin(event: ReactPointerEvent<SVGElement>, object: ShapeObject, kind: DragKind): void;
  move(event: ReactPointerEvent<SVGElement>): void;
  end(event: ReactPointerEvent<SVGElement>): void;
};

const geometryOf = (s: ShapeObject): ShapeGeometry => ({
  x: s.x,
  y: s.y,
  w: s.w,
  h: s.h,
  rotation: s.rotation,
});

/**
 * 확정된 도형을 SVG로 그리고 선택·이동·크기·회전·끝점 조절을 처리한다.
 * 좌표는 페이지 공간 그대로 두고 <g transform=matrix>로 화면에 맞춘다(선 굵기도 배율을 따른다).
 */
export function ShapeLayer({
  session,
  pageIndex,
  pageSize,
  scale,
  matrix,
  objects,
  interactive,
}: ShapeLayerProps) {
  const tool = useToolStore((s) => s.tool);
  const selected = useSelectionStore((s) => s.selected);
  const select = useSelectionStore((s) => s.select);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [live, setLive] = useState<(ShapeGeometry & { id: string }) | null>(null);

  const selectable = interactive && (tool === 'shape' || tool === 'hand');
  const shapes = objects.filter((o): o is ShapeObject => o.type === 'shape');

  function toPage(clientX: number, clientY: number): Point {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return displayToPage({ x: clientX - rect.left, y: clientY - rect.top }, pageSize, scale);
  }

  const handlers: Handlers = {
    begin(event, object, kind) {
      if (!selectable) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.stopPropagation();
      event.preventDefault();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* 합성 이벤트는 캡처가 실패할 수 있다 */
      }
      dragRef.current = {
        pointerId: event.pointerId,
        kind,
        startClient: { x: event.clientX, y: event.clientY },
        start: toPage(event.clientX, event.clientY),
        startObject: object,
        moved: false,
        live: geometryOf(object),
      };
    },
    move(event) {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.stopPropagation();
      const travelled = Math.hypot(
        event.clientX - drag.startClient.x,
        event.clientY - drag.startClient.y,
      );
      if (!drag.moved && travelled < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      const p = toPage(event.clientX, event.clientY);
      const o = drag.startObject;
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      if (drag.kind === 'move') {
        drag.live = { ...drag.live, x: o.x + dx, y: o.y + dy };
      } else if (drag.kind === 'start' || drag.kind === 'end') {
        const { start, end } = lineEndpoints(o);
        drag.live =
          drag.kind === 'start'
            ? lineFromEndpoints({ x: start.x + dx, y: start.y + dy }, end)
            : lineFromEndpoints(start, { x: end.x + dx, y: end.y + dy });
      } else if (drag.kind === 'resize') {
        // 회전한 상자는 로컬 좌표에서 오른쪽 아래 모서리를 끌고, 중심을 다시 계산한다
        const center = { x: o.x + o.w / 2, y: o.y + o.h / 2 };
        const local = rotatePoint(p, center, -o.rotation);
        const w = Math.max(4, local.x - o.x);
        const h = Math.max(4, local.y - o.y);
        const newCenter = rotatePoint({ x: o.x + w / 2, y: o.y + h / 2 }, center, o.rotation);
        drag.live = { ...drag.live, w, h, x: newCenter.x - w / 2, y: newCenter.y - h / 2 };
      } else {
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const a0 = Math.atan2(drag.start.y - cy, drag.start.x - cx);
        const a1 = Math.atan2(p.y - cy, p.x - cx);
        let rotation = o.rotation + ((a1 - a0) * 180) / Math.PI;
        const nearest = Math.round(rotation / 90) * 90;
        if (Math.abs(rotation - nearest) < SNAP_DEG) rotation = nearest;
        drag.live = { ...drag.live, rotation: normalizeAngle(Math.round(rotation)) };
      }
      setLive({ id: o.id, ...drag.live });
    },
    end(event) {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      event.stopPropagation();
      dragRef.current = null;
      setLive(null);
      const o = drag.startObject;
      if (!drag.moved) {
        select({ pageIndex, id: o.id });
        return;
      }
      const after = withShapeGeometry(o, drag.live, pageSize);
      const changed =
        after.x !== o.x ||
        after.y !== o.y ||
        after.w !== o.w ||
        after.h !== o.h ||
        after.rotation !== o.rotation;
      if (changed) {
        const label =
          drag.kind === 'move'
            ? '이동'
            : drag.kind === 'rotate'
              ? '회전'
              : drag.kind === 'resize'
                ? '크기 조절'
                : '끝점 이동';
        session.commit(label, [{ kind: 'update', before: o, after }]);
      }
      select({ pageIndex, id: o.id });
    },
  };

  const m = matrix;
  const handleSize = HANDLE_PX / scale;
  const hitWidth = HIT_PX / scale;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
      data-shape-layer={pageIndex}
    >
      <svg width="100%" height="100%" style={{ overflow: 'visible', display: 'block' }}>
        <g transform={`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`}>
          {shapes.map((shape) => (
            <ShapeItem
              key={shape.id}
              shape={shape}
              geometry={live?.id === shape.id ? live : shape}
              active={selected?.pageIndex === pageIndex && selected.id === shape.id}
              selectable={selectable}
              handleSize={handleSize}
              hitWidth={hitWidth}
              rotateOffset={ROTATE_OFFSET_PX / scale}
              handlers={handlers}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}

interface ShapeItemProps {
  shape: ShapeObject;
  geometry: ShapeGeometry;
  active: boolean;
  selectable: boolean;
  handleSize: number;
  hitWidth: number;
  rotateOffset: number;
  handlers: Handlers;
}

function ShapeItem({
  shape,
  geometry: g,
  active,
  selectable,
  handleSize,
  hitWidth,
  rotateOffset,
  handlers,
}: ShapeItemProps) {
  const dash = shape.dash && shape.dash.length > 0 ? shape.dash.join(' ') : undefined;
  const pointerEvents = selectable ? 'auto' : 'none';
  const bodyProps = {
    onPointerDown: (e: ReactPointerEvent<SVGElement>) => handlers.begin(e, shape, 'move'),
    onPointerMove: handlers.move,
    onPointerUp: handlers.end,
    onPointerCancel: handlers.end,
    style: { pointerEvents, cursor: selectable ? 'move' : 'default', touchAction: 'none' } as const,
  };
  const handleProps = (kind: DragKind, cursor: string) => ({
    onPointerDown: (e: ReactPointerEvent<SVGElement>) => handlers.begin(e, shape, kind),
    onPointerMove: handlers.move,
    onPointerUp: handlers.end,
    onPointerCancel: handlers.end,
    style: { pointerEvents: 'auto', cursor, touchAction: 'none' } as const,
    fill: '#ffffff',
    stroke: '#4f46e5',
    strokeWidth: handleSize * 0.2,
  });

  if (isLinear(shape.shape)) {
    const { start, end } = lineEndpoints(g);
    const head = shape.shape === 'arrow' ? arrowHeadSize(shape.strokeWidth) : 0;
    const bodyEnd = Math.max(0, g.w - head * 0.6);
    const [tip, left, right] = arrowHeadLocal(g.w, shape.strokeWidth);
    return (
      <g data-shape-id={shape.id} data-shape-kind={shape.shape}>
        <g transform={`translate(${g.x} ${g.y}) rotate(${g.rotation})`}>
          <line
            x1={0}
            y1={0}
            x2={bodyEnd}
            y2={0}
            stroke={shape.stroke}
            strokeWidth={shape.strokeWidth}
            strokeLinecap="round"
            strokeDasharray={dash}
            style={{ pointerEvents: 'none' }}
          />
          {shape.shape === 'arrow' && (
            <polygon
              points={`${tip.x},${tip.y} ${left.x},${left.y} ${right.x},${right.y}`}
              fill={shape.stroke}
              style={{ pointerEvents: 'none' }}
            />
          )}
          <line
            x1={0}
            y1={0}
            x2={g.w}
            y2={0}
            stroke="transparent"
            strokeWidth={Math.max(shape.strokeWidth, hitWidth)}
            strokeLinecap="round"
            data-shape-hit={shape.id}
            {...bodyProps}
          />
        </g>
        {active && selectable && (
          <>
            <circle
              cx={start.x}
              cy={start.y}
              r={handleSize / 2}
              data-shape-handle="start"
              {...handleProps('start', 'crosshair')}
            />
            <circle
              cx={end.x}
              cy={end.y}
              r={handleSize / 2}
              data-shape-handle="end"
              {...handleProps('end', 'crosshair')}
            />
          </>
        )}
      </g>
    );
  }

  const cx = g.x + g.w / 2;
  const cy = g.y + g.h / 2;
  const fill = shape.fill ?? 'none';
  const shapeEl =
    shape.shape === 'rect' ? (
      <rect
        x={g.x}
        y={g.y}
        width={g.w}
        height={g.h}
        fill={fill}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        strokeDasharray={dash}
        strokeLinejoin="round"
        style={{ pointerEvents: 'none' }}
      />
    ) : (
      <ellipse
        cx={cx}
        cy={cy}
        rx={g.w / 2}
        ry={g.h / 2}
        fill={fill}
        stroke={shape.stroke}
        strokeWidth={shape.strokeWidth}
        strokeDasharray={dash}
        style={{ pointerEvents: 'none' }}
      />
    );
  // 채움이 없으면 테두리만 잡히고, 채움이 있으면 안쪽도 잡힌다
  const hitEl =
    shape.shape === 'rect' ? (
      <rect
        x={g.x}
        y={g.y}
        width={g.w}
        height={g.h}
        fill={shape.fill ? 'transparent' : 'none'}
        stroke="transparent"
        strokeWidth={Math.max(shape.strokeWidth, hitWidth)}
        data-shape-hit={shape.id}
        {...bodyProps}
        style={{
          ...bodyProps.style,
          pointerEvents: selectable ? (shape.fill ? 'auto' : 'stroke') : 'none',
        }}
      />
    ) : (
      <ellipse
        cx={cx}
        cy={cy}
        rx={g.w / 2}
        ry={g.h / 2}
        fill={shape.fill ? 'transparent' : 'none'}
        stroke="transparent"
        strokeWidth={Math.max(shape.strokeWidth, hitWidth)}
        data-shape-hit={shape.id}
        {...bodyProps}
        style={{
          ...bodyProps.style,
          pointerEvents: selectable ? (shape.fill ? 'auto' : 'stroke') : 'none',
        }}
      />
    );

  return (
    <g data-shape-id={shape.id} data-shape-kind={shape.shape}>
      <g transform={`rotate(${g.rotation} ${cx} ${cy})`}>
        {shapeEl}
        {hitEl}
        {active && selectable && (
          <>
            <rect
              x={g.x}
              y={g.y}
              width={g.w}
              height={g.h}
              fill="none"
              stroke="#4f46e5"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
            <line
              x1={cx}
              y1={g.y}
              x2={cx}
              y2={g.y - rotateOffset + handleSize / 2}
              stroke="#4f46e5"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
              style={{ pointerEvents: 'none' }}
            />
            <circle
              cx={cx}
              cy={g.y - rotateOffset}
              r={handleSize / 2}
              data-shape-handle="rotate"
              {...handleProps('rotate', 'grab')}
            />
            <rect
              x={g.x + g.w - handleSize / 2}
              y={g.y + g.h - handleSize / 2}
              width={handleSize}
              height={handleSize}
              rx={handleSize * 0.2}
              data-shape-handle="resize"
              {...handleProps('resize', 'nwse-resize')}
              fill="#4f46e5"
              stroke="#ffffff"
            />
          </>
        )}
      </g>
    </g>
  );
}
