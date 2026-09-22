import {
  ANNOTATION_SCHEMA_VERSION,
  bboxExpand,
  bboxOfPoints,
  createEntityBase,
  type AnnotationObject,
  type InkObject,
  type InkTool,
  type PageSize,
} from '@pdf-memo/shared';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { PageBox } from '../viewer/layout';
import {
  displayToPage,
  distance,
  inkHit,
  pageToDisplayMatrix,
  roundInkPoints,
  type Point,
} from './geometry';
import { usePageObjects } from './hooks';
import { TOOL_PROFILES, drawInk, sizeCanvas, type InkLike } from './ink';
import { penTracker } from './penTracker';
import type { AnnotationSession } from './session';
import { isInkTool, useToolStore, type Tool } from './toolStore';
import { createNoteObject, createTextObject } from '../text/model';
import { useSelectionStore } from '../text/selectionStore';
import { TextLayer } from '../text/TextLayer';
import { bboxContainsPoint } from '@pdf-memo/shared';
import type { TextObject } from '@pdf-memo/shared';

interface AnnotationLayerProps {
  session: AnnotationSession;
  pageIndex: number;
  pageSize: PageSize;
  scale: number;
  box: PageBox;
  /** 핀치 중에는 새 스트로크를 받지 않는다 */
  interactive: boolean;
}

interface StrokeState {
  pointerId: number;
  tool: Tool;
  ink: InkTool | null;
  points: number[];
  last: Point | null;
  erased: Map<string, AnnotationObject>;
  cursor: Point | null;
}

const EMPTY_HIDDEN: ReadonlySet<string> = new Set();
const MIN_POINT_DISTANCE = 0.3;
const MAX_DPR = 3;

const isHighlight = (o: AnnotationObject) => o.type === 'ink' && o.tool === 'highlighter';
const isPlainInk = (o: AnnotationObject) => o.type === 'ink' && o.tool !== 'highlighter';

/**
 * 페이지 위 주석 레이어.
 * 캔버스 3장: 형광펜(multiply 블렌드) · 일반 잉크 · 그리는 중/지우개 커서.
 * 포인터 입력을 페이지 공간(pt)으로 바꿔 스트로크를 만들고, 손을 떼면 세션에 커밋한다.
 */
export function AnnotationLayer({
  session,
  pageIndex,
  pageSize,
  scale,
  box,
  interactive,
}: AnnotationLayerProps) {
  const objects = usePageObjects(session, pageIndex);
  const tool = useToolStore((s) => s.tool);
  const fingerDraws = useToolStore((s) => s.fingerDraws);
  const eraserRadius = useToolStore((s) => s.eraserRadius);
  const inkSettings = useToolStore((s) => (isInkTool(s.tool) ? s[s.tool] : null));

  const highlightRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const strokeRef = useRef<StrokeState | null>(null);
  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const frameRef = useRef(0);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(EMPTY_HIDDEN);
  /** 텍스트 도구로 방금 만든, 아직 커밋 전인 상자 */
  const [draft, setDraft] = useState<TextObject | null>(null);
  /** 텍스트·노트 도구의 탭 판정 (움직이면 취소) */
  const tapRef = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    /** 탭 시작 시점에 텍스트를 편집 중이었으면 이 탭은 편집 종료로만 쓴다 */
    wasEditing: boolean;
  } | null>(null);
  const TAP_MOVE_PX = 8;

  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const matrix = useMemo(() => pageToDisplayMatrix(pageSize, scale), [pageSize, scale]);

  // 확정 객체 다시 그리기 (객체·배율·지우개 진행 상태가 바뀔 때만)
  useEffect(() => {
    const layers: Array<[HTMLCanvasElement | null, (o: AnnotationObject) => boolean]> = [
      [highlightRef.current, isHighlight],
      [inkRef.current, isPlainInk],
    ];
    for (const [canvas, filter] of layers) {
      if (!canvas) continue;
      sizeCanvas(canvas, box.width, box.height, dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const object of objects) {
        if (object.type !== 'ink' || !filter(object) || hidden.has(object.id)) continue;
        drawInk(ctx, object, matrix, dpr);
      }
    }
  }, [objects, hidden, box.width, box.height, matrix, dpr]);

  useEffect(() => {
    const canvas = liveRef.current;
    if (canvas) sizeCanvas(canvas, box.width, box.height, dpr);
  }, [box.width, box.height, dpr]);

  const drawLive = useCallback(() => {
    frameRef.current = 0;
    const canvas = liveRef.current;
    const stroke = strokeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!stroke) return;
    if (stroke.tool === 'eraser') {
      if (!stroke.cursor) return;
      const m = matrix;
      const cx = (m.a * stroke.cursor.x + m.c * stroke.cursor.y + m.e) * dpr;
      const cy = (m.b * stroke.cursor.x + m.d * stroke.cursor.y + m.f) * dpr;
      ctx.beginPath();
      ctx.arc(cx, cy, eraserRadius * scale * dpr, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.stroke();
      return;
    }
    if (!stroke.ink) return;
    const settings = useToolStore.getState()[stroke.ink];
    const profile = TOOL_PROFILES[stroke.ink];
    const live: InkLike = {
      tool: stroke.ink,
      color: settings.color,
      opacity: profile.opacity,
      width: settings.width,
      points: stroke.points,
      smoothing: {
        thinning: profile.thinning,
        smoothing: profile.smoothing,
        streamline: profile.streamline,
      },
    };
    drawInk(ctx, live, matrix, dpr, false);
  }, [matrix, dpr, eraserRadius, scale]);

  const scheduleDraw = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(drawLive);
  }, [drawLive]);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  function toPage(event: { clientX: number; clientY: number }): Point {
    const canvas = liveRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return displayToPage(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      pageSize,
      scale,
    );
  }

  function shouldStart(event: ReactPointerEvent<HTMLCanvasElement>): boolean {
    if (!interactive || tool === 'hand') return false;
    if (event.pointerType === 'touch')
      return fingerDraws && event.isPrimary && !penTracker.isPalmWindow();
    if (event.pointerType === 'mouse') return event.button === 0;
    return true;
  }

  function effectiveTool(event: ReactPointerEvent<HTMLCanvasElement>): Tool {
    // 펜 뒷꼭지(지우개 끝)나 배럴 버튼
    if (event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) !== 0))
      return 'eraser';
    return tool;
  }

  function appendPoint(stroke: StrokeState, p: Point, pressure: number) {
    if (stroke.last && distance(stroke.last, p) < MIN_POINT_DISTANCE) return;
    stroke.points.push(p.x, p.y, pressure);
    stroke.last = p;
  }

  function eraseAt(stroke: StrokeState, p: Point) {
    stroke.cursor = p;
    let changed = false;
    for (const object of objectsRef.current) {
      if (stroke.erased.has(object.id)) continue;
      const hit =
        object.type === 'ink'
          ? inkHit(object.points, object.width, p, eraserRadius)
          : (object.type === 'text' || object.type === 'note') &&
            bboxContainsPoint(bboxExpand(object.bbox, eraserRadius), p);
      if (hit) {
        stroke.erased.set(object.id, object);
        changed = true;
      }
    }
    if (changed) setHidden(new Set(stroke.erased.keys()));
  }

  /** 텍스트·노트 도구: 탭한 자리에 객체를 만든다. 편집 중이던 탭은 편집을 끝내는 데만 쓴다 */
  function placeAt(p: Point, wasEditing: boolean) {
    const selection = useSelectionStore.getState();
    selection.select(null);
    if (wasEditing) return;
    if (tool === 'text') {
      const defaults = useToolStore.getState().text;
      const created = createTextObject(
        session.documentId,
        pageIndex,
        session.nextZ(pageIndex),
        p,
        pageSize,
        defaults,
      );
      setDraft(created);
      selection.select({ pageIndex, id: created.id });
      selection.setEditing(created.id);
    } else if (tool === 'note') {
      const note = createNoteObject(
        session.documentId,
        pageIndex,
        session.nextZ(pageIndex),
        p,
        pageSize,
        useToolStore.getState().note.color,
      );
      session.commit('노트', [{ kind: 'add', object: note }]);
      selection.select({ pageIndex, id: note.id });
      selection.setEditing(note.id);
    }
  }

  function pressureOf(event: { pressure: number; pointerType: string }): number {
    return event.pressure > 0 ? event.pressure : 0.5;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (tool === 'text' || tool === 'note') {
      if (!interactive || (event.pointerType === 'mouse' && event.button !== 0)) return;
      if (event.pointerType === 'touch' && !event.isPrimary) return;
      tapRef.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        wasEditing: useSelectionStore.getState().editingId !== null,
      };
      return;
    }
    if (strokeRef.current || !shouldStart(event)) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 합성 이벤트 등 활성 포인터가 아니면 캡처가 실패할 수 있다. 캡처 없이도 그리기는 동작한다
    }
    if (event.pointerType === 'pen') penTracker.down();
    const active = effectiveTool(event);
    const stroke: StrokeState = {
      pointerId: event.pointerId,
      tool: active,
      ink: isInkTool(active) ? active : null,
      points: [],
      last: null,
      erased: new Map(),
      cursor: null,
    };
    strokeRef.current = stroke;
    const p = toPage(event);
    if (active === 'eraser') eraseAt(stroke, p);
    else appendPoint(stroke, p, pressureOf(event));
    scheduleDraw();
  }

  function onPointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const tap = tapRef.current;
    if (tap && event.pointerId === tap.pointerId) {
      if (Math.hypot(event.clientX - tap.clientX, event.clientY - tap.clientY) > TAP_MOVE_PX) {
        tapRef.current = null;
      }
      return;
    }
    const stroke = strokeRef.current;
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    event.preventDefault();
    const native = event.nativeEvent;
    const samples: Array<{
      clientX: number;
      clientY: number;
      pressure: number;
      pointerType: string;
    }> =
      typeof native.getCoalescedEvents === 'function' && native.getCoalescedEvents().length > 0
        ? native.getCoalescedEvents()
        : [native];
    for (const sample of samples) {
      const p = toPage(sample);
      if (stroke.tool === 'eraser') eraseAt(stroke, p);
      else appendPoint(stroke, p, pressureOf(sample));
    }
    scheduleDraw();
  }

  function onPointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const tap = tapRef.current;
    if (tap && event.pointerId === tap.pointerId) {
      tapRef.current = null;
      placeAt(toPage(event), tap.wasEditing);
      return;
    }
    finish(event);
  }

  function onPointerCancel(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (tapRef.current?.pointerId === event.pointerId) tapRef.current = null;
    finish(event);
  }

  function finish(event: ReactPointerEvent<HTMLCanvasElement>) {
    const stroke = strokeRef.current;
    if (!stroke || event.pointerId !== stroke.pointerId) return;
    strokeRef.current = null;
    if (event.pointerType === 'pen') penTracker.up();
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;

    if (stroke.tool === 'eraser') {
      setHidden(EMPTY_HIDDEN);
      const removed = [...stroke.erased.values()];
      if (removed.length > 0) {
        session.commit(
          '지우기',
          removed.map((object) => ({ kind: 'remove' as const, object })),
        );
      }
    } else if (stroke.ink && stroke.points.length >= 3) {
      const settings = useToolStore.getState()[stroke.ink];
      const profile = TOOL_PROFILES[stroke.ink];
      const points = roundInkPoints(stroke.points);
      const object: InkObject = {
        ...createEntityBase(),
        schemaVersion: ANNOTATION_SCHEMA_VERSION,
        documentId: session.documentId,
        pageIndex,
        z: session.nextZ(pageIndex),
        bbox: bboxExpand(bboxOfPoints(points, 3), settings.width / 2),
        locked: false,
        type: 'ink',
        tool: stroke.ink,
        color: settings.color,
        opacity: profile.opacity,
        width: settings.width,
        points,
        smoothing: {
          thinning: profile.thinning,
          smoothing: profile.smoothing,
          streamline: profile.streamline,
        },
      };
      session.commit(labelFor(stroke.ink), [{ kind: 'add', object }]);
    }
    drawLive();
  }

  const cursor =
    tool === 'hand'
      ? 'grab'
      : tool === 'eraser'
        ? 'cell'
        : tool === 'text'
          ? 'text'
          : tool === 'note'
            ? 'copy'
            : 'crosshair';

  return (
    <div
      className="absolute"
      style={{
        top: box.top,
        left: box.left,
        width: box.width,
        height: box.height,
        touchAction: tool === 'hand' ? 'pan-x pan-y' : 'none',
      }}
      data-annotation-layer={pageIndex}
    >
      <canvas
        ref={highlightRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ mixBlendMode: 'multiply' }}
        aria-hidden
      />
      <canvas
        ref={inkRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      />
      <canvas
        ref={liveRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor, mixBlendMode: tool === 'highlighter' ? 'multiply' : 'normal' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={finish}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={`${pageIndex + 1}페이지 필기 영역`}
        role="img"
        data-ink-settings={inkSettings ? `${inkSettings.color}/${inkSettings.width}` : undefined}
      />
      <TextLayer
        session={session}
        pageIndex={pageIndex}
        pageSize={pageSize}
        scale={scale}
        matrix={matrix}
        objects={objects}
        draft={draft}
        onDraftDone={() => setDraft(null)}
        interactive={interactive}
      />
    </div>
  );
}

function labelFor(tool: InkTool): string {
  switch (tool) {
    case 'pen':
      return '펜';
    case 'highlighter':
      return '형광펜';
    case 'marker':
      return '마커';
  }
}
