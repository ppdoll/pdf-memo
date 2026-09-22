import type { AnnotationObject, ImageObject, PageSize } from '@pdf-memo/shared';
import {
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { storage } from '../../storage';
import { applyMatrix, displayToPage, type Matrix, type Point } from '../annotate/geometry';
import type { AnnotationSession } from '../annotate/session';
import { useToolStore } from '../annotate/toolStore';
import { useSelectionStore } from '../text/selectionStore';
import { packStickerOf, useAssetUrl } from './assets';
import {
  STICKER_MIN_SIZE,
  normalizeRotation,
  withImageGeometry,
  type ImageGeometry,
} from './model';
import { StickerGraphic } from './StickerGraphic';

const DRAG_THRESHOLD_PX = 4;
/** 0·90·180·270도 근처에서는 각도를 붙인다 */
const SNAP_DEG = 5;

type DragKind = 'move' | 'resize' | 'rotate';

interface DragState {
  pointerId: number;
  kind: DragKind;
  startClient: Point;
  /** 시작점 (페이지 공간) */
  start: Point;
  startObject: ImageObject;
  moved: boolean;
  live: ImageGeometry;
}

interface StickerLayerProps {
  session: AnnotationSession;
  pageIndex: number;
  pageSize: PageSize;
  scale: number;
  matrix: Matrix;
  objects: readonly AnnotationObject[];
  interactive: boolean;
}

type Handlers = {
  begin(event: ReactPointerEvent<HTMLElement>, object: ImageObject, kind: DragKind): void;
  move(event: ReactPointerEvent<HTMLElement>): void;
  end(event: ReactPointerEvent<HTMLElement>): void;
};

const geometryOf = (o: ImageObject): ImageGeometry => ({
  x: o.x,
  y: o.y,
  w: o.w,
  h: o.h,
  rotation: o.rotation,
});

/**
 * 페이지 위 스티커(이미지 객체) 레이어. 스티커·손 도구에서 탭해 선택하고, 끌어서 이동,
 * 우하단 핸들로 크기(비율 고정), 위쪽 핸들로 회전한다. 텍스트 레이어 아래, 잉크 캔버스 위에 놓인다.
 */
export function StickerLayer({
  session,
  pageIndex,
  pageSize,
  scale,
  matrix,
  objects,
  interactive,
}: StickerLayerProps) {
  const tool = useToolStore((s) => s.tool);
  const selected = useSelectionStore((s) => s.selected);
  const select = useSelectionStore((s) => s.select);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [live, setLive] = useState<(ImageGeometry & { id: string }) | null>(null);

  const selectable = interactive && (tool === 'sticker' || tool === 'hand');
  const images = objects.filter((o): o is ImageObject => o.type === 'image');

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
      const cx = o.x + o.w / 2;
      const cy = o.y + o.h / 2;
      if (drag.kind === 'move') {
        drag.live = { ...drag.live, x: o.x + (p.x - drag.start.x), y: o.y + (p.y - drag.start.y) };
      } else if (drag.kind === 'resize') {
        const d0 = Math.hypot(drag.start.x - cx, drag.start.y - cy) || 1;
        const d1 = Math.hypot(p.x - cx, p.y - cy);
        const w = Math.max(STICKER_MIN_SIZE, o.w * (d1 / d0));
        const h = w * (o.h / o.w);
        drag.live = { ...drag.live, w, h, x: cx - w / 2, y: cy - h / 2 };
      } else {
        const a0 = Math.atan2(drag.start.y - cy, drag.start.x - cx);
        const a1 = Math.atan2(p.y - cy, p.x - cx);
        let rotation = o.rotation + ((a1 - a0) * 180) / Math.PI;
        const nearest = Math.round(rotation / 90) * 90;
        if (Math.abs(rotation - nearest) < SNAP_DEG) rotation = nearest;
        drag.live = { ...drag.live, rotation: normalizeRotation(Math.round(rotation)) };
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
      const after = withImageGeometry(o, drag.live, pageSize);
      const changed =
        after.x !== o.x ||
        after.y !== o.y ||
        after.w !== o.w ||
        after.h !== o.h ||
        after.rotation !== o.rotation;
      if (changed) {
        const label = drag.kind === 'move' ? '이동' : drag.kind === 'resize' ? '크기 조절' : '회전';
        session.commit(label, [{ kind: 'update', before: o, after }]);
      }
      select({ pageIndex, id: o.id });
    },
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
      data-sticker-layer={pageIndex}
    >
      {images.map((image) => (
        <StickerItem
          key={image.id}
          image={image}
          geometry={live?.id === image.id ? live : image}
          active={selected?.pageIndex === pageIndex && selected.id === image.id}
          selectable={selectable}
          scale={scale}
          matrix={matrix}
          pageRotation={pageSize.rotation}
          handlers={handlers}
        />
      ))}
    </div>
  );
}

interface StickerItemProps {
  image: ImageObject;
  geometry: ImageGeometry;
  active: boolean;
  selectable: boolean;
  scale: number;
  matrix: Matrix;
  pageRotation: number;
  handlers: Handlers;
}

function StickerItem({
  image,
  geometry: g,
  active,
  selectable,
  scale,
  matrix,
  pageRotation,
  handlers,
}: StickerItemProps) {
  const def = packStickerOf(image.assetId);
  const url = useAssetUrl(storage, image.assetId);
  const center = applyMatrix(matrix, { x: g.x + g.w / 2, y: g.y + g.h / 2 });
  const widthPx = g.w * scale;
  const heightPx = g.h * scale;
  const style: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width: widthPx,
    height: heightPx,
    transform: `translate(${center.x - widthPx / 2}px, ${center.y - heightPx / 2}px) rotate(${pageRotation + g.rotation}deg)`,
    transformOrigin: '50% 50%',
    pointerEvents: selectable ? 'auto' : 'none',
    cursor: selectable ? 'move' : 'default',
    touchAction: 'none',
    outline: active ? '1.5px solid #4f46e5' : undefined,
    outlineOffset: 2,
  };
  const handleStyle = (extra: CSSProperties): CSSProperties => ({
    position: 'absolute',
    touchAction: 'none',
    boxSizing: 'border-box',
    ...extra,
  });

  return (
    <div
      data-sticker-id={image.id}
      style={style}
      onPointerDown={(e) => handlers.begin(e, image, 'move')}
      onPointerMove={handlers.move}
      onPointerUp={handlers.end}
      onPointerCancel={handlers.end}
    >
      <div style={{ width: '100%', height: '100%', opacity: image.opacity }}>
        {def ? (
          <StickerGraphic def={def} />
        ) : url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', background: '#e2e8f0', borderRadius: 4 }} />
        )}
      </div>
      {active && selectable && (
        <>
          <span
            role="presentation"
            data-rotate-handle
            onPointerDown={(e) => handlers.begin(e, image, 'rotate')}
            onPointerMove={handlers.move}
            onPointerUp={handlers.end}
            onPointerCancel={handlers.end}
            style={handleStyle({
              left: '50%',
              top: -30,
              width: 16,
              height: 16,
              marginLeft: -8,
              borderRadius: '50%',
              background: '#ffffff',
              border: '2px solid #4f46e5',
              cursor: 'grab',
            })}
          />
          <span
            role="presentation"
            style={handleStyle({
              left: '50%',
              top: -14,
              width: 2,
              height: 14,
              marginLeft: -1,
              background: '#4f46e5',
              pointerEvents: 'none',
            })}
          />
          <span
            role="presentation"
            data-resize-handle
            onPointerDown={(e) => handlers.begin(e, image, 'resize')}
            onPointerMove={handlers.move}
            onPointerUp={handlers.end}
            onPointerCancel={handlers.end}
            style={handleStyle({
              right: -7,
              bottom: -7,
              width: 14,
              height: 14,
              borderRadius: 3,
              background: '#4f46e5',
              border: '2px solid white',
              cursor: 'nwse-resize',
            })}
          />
        </>
      )}
    </div>
  );
}
