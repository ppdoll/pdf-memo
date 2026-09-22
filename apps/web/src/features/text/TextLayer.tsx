import type { AnnotationObject, NoteObject, PageSize, TextObject } from '@pdf-memo/shared';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { applyMatrix, displayToPage, type Matrix, type Point } from '../annotate/geometry';
import type { AnnotationSession } from '../annotate/session';
import { useToolStore } from '../annotate/toolStore';
import { ensureTextFont } from './font';
import {
  NOTE_EXPANDED_WIDTH,
  NOTE_SIZE,
  TEXT_FONT_FAMILY,
  TEXT_LINE_HEIGHT,
  TEXT_PADDING,
  minTextHeight,
  withNotePosition,
  withTextGeometry,
} from './model';
import { useSelectionStore } from './selectionStore';

const NOTE_FONT_SIZE = 11;
const DRAG_THRESHOLD_PX = 4;

interface TextLayerProps {
  session: AnnotationSession;
  pageIndex: number;
  pageSize: PageSize;
  scale: number;
  matrix: Matrix;
  objects: readonly AnnotationObject[];
  /** 커밋 전 초안 (텍스트 도구로 방금 만든 빈 상자) */
  draft: TextObject | null;
  onDraftDone: () => void;
  interactive: boolean;
}

interface DragState {
  pointerId: number;
  kind: 'move' | 'resize';
  start: Point;
  startObject: TextObject | NoteObject;
  moved: boolean;
  /** 이동 중 임시 위치·크기 (페이지 공간) */
  live: { x: number; y: number; w?: number };
}

/**
 * 페이지 위 텍스트 상자·스티키 노트 레이어 (HTML).
 * 캔버스 위에 놓이며, 텍스트·노트·손 도구에서만 포인터를 받는다. 펜으로는 위에 그대로 그릴 수 있다.
 */
export function TextLayer({
  session,
  pageIndex,
  pageSize,
  scale,
  matrix,
  objects,
  draft,
  onDraftDone,
  interactive,
}: TextLayerProps) {
  const tool = useToolStore((s) => s.tool);
  const selected = useSelectionStore((s) => s.selected);
  const editingId = useSelectionStore((s) => s.editingId);
  const select = useSelectionStore((s) => s.select);
  const setEditing = useSelectionStore((s) => s.setEditing);
  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [live, setLive] = useState<{ id: string; x: number; y: number; w?: number } | null>(null);
  const pendingResize = useRef<{ before: TextObject; w: number } | null>(null);

  const selectable = interactive && (tool === 'text' || tool === 'note' || tool === 'hand');
  const texts = objects.filter((o): o is TextObject => o.type === 'text');
  const notes = objects.filter((o): o is NoteObject => o.type === 'note');

  useEffect(() => {
    if (texts.length > 0 || notes.length > 0 || draft || tool === 'text' || tool === 'note') {
      void ensureTextFont();
    }
  }, [texts.length, notes.length, draft, tool]);

  function toPage(clientX: number, clientY: number): Point {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return displayToPage({ x: clientX - rect.left, y: clientY - rect.top }, pageSize, scale);
  }

  function isSelected(id: string) {
    return selected?.pageIndex === pageIndex && selected.id === id;
  }

  // ----- 이동·크기 조절 -----
  function beginDrag(
    event: ReactPointerEvent<HTMLElement>,
    object: TextObject | NoteObject,
    kind: DragState['kind'],
  ) {
    if (!selectable || editingId === object.id) return;
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
      start: { x: event.clientX, y: event.clientY },
      startObject: object,
      moved: false,
      live: { x: object.x, y: object.y, w: object.type === 'text' ? object.w : undefined },
    };
  }

  function onDragMove(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();
    const distance = Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y);
    if (!drag.moved && distance < DRAG_THRESHOLD_PX) return;
    drag.moved = true;
    const from = toPage(drag.start.x, drag.start.y);
    const to = toPage(event.clientX, event.clientY);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (drag.kind === 'move') {
      drag.live = { ...drag.live, x: drag.startObject.x + dx, y: drag.startObject.y + dy };
    } else if (drag.startObject.type === 'text') {
      drag.live = { ...drag.live, w: Math.max(40, drag.startObject.w + dx) };
    }
    setLive({ id: drag.startObject.id, ...drag.live });
  }

  function onDragEnd(event: ReactPointerEvent<HTMLElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.stopPropagation();
    dragRef.current = null;
    setLive(null);
    const object = drag.startObject;
    if (!drag.moved) {
      // 탭: 선택 → 이미 선택된 텍스트는 편집, 노트는 접기/펼치기
      if (!isSelected(object.id)) {
        select({ pageIndex, id: object.id });
      } else if (object.type === 'text') {
        setEditing(object.id);
      } else {
        session.commit('노트 접기', [
          { kind: 'update', before: object, after: { ...object, collapsed: !object.collapsed } },
        ]);
      }
      return;
    }
    if (drag.kind === 'move') {
      const after =
        object.type === 'text'
          ? withTextGeometry(object, { x: drag.live.x, y: drag.live.y }, pageSize)
          : withNotePosition(object, { x: drag.live.x, y: drag.live.y }, pageSize);
      if (after.x !== object.x || after.y !== object.y) {
        session.commit('이동', [{ kind: 'update', before: object, after }]);
      }
    } else if (object.type === 'text' && drag.live.w !== undefined) {
      pendingResize.current = { before: object, w: drag.live.w };
      setLive({ id: object.id, x: object.x, y: object.y, w: drag.live.w });
    }
    select({ pageIndex, id: object.id });
  }

  // 크기 조절 후: 새 폭으로 렌더된 높이를 재고 한 번에 커밋한다
  useLayoutEffect(() => {
    const pending = pendingResize.current;
    if (!pending || !live || live.id !== pending.before.id || live.w === undefined) return;
    // 핸들(absolute)이 scrollHeight를 부풀리므로 내용 요소만 잰다
    const content = rootRef.current?.querySelector<HTMLElement>(
      `[data-text-id="${pending.before.id}"] [data-text-content]`,
    );
    const h = content
      ? Math.max(
          minTextHeight(pending.before.fontSize),
          Math.ceil(content.offsetHeight / scale) + TEXT_PADDING * 2,
        )
      : pending.before.h;
    pendingResize.current = null;
    setLive(null);
    const after = withTextGeometry(pending.before, { w: pending.w, h }, pageSize);
    if (after.w !== pending.before.w || after.h !== pending.before.h) {
      session.commit('크기 조절', [{ kind: 'update', before: pending.before, after }]);
    }
  }, [live, pageSize, scale, session]);

  // ----- 편집 -----
  function commitText(object: TextObject, content: string, heightPx: number, isDraft: boolean) {
    const trimmed = content.replace(/\s+$/g, '');
    // heightPx는 textarea 내용 높이(여백 제외)이므로 상자 높이에는 위아래 여백을 더한다
    const h = Math.max(
      minTextHeight(object.fontSize),
      Math.ceil(heightPx / scale) + TEXT_PADDING * 2,
    );
    if (isDraft) {
      if (trimmed.trim() !== '') {
        const created = withTextGeometry({ ...object, content: trimmed }, { h }, pageSize);
        session.commit('텍스트', [{ kind: 'add', object: created }]);
        select({ pageIndex, id: created.id });
      }
      onDraftDone();
      setEditing(null);
      return;
    }
    if (trimmed.trim() === '') {
      session.commit('텍스트 삭제', [{ kind: 'remove', object }]);
      select(null);
    } else if (trimmed !== object.content || h !== object.h) {
      const after = withTextGeometry({ ...object, content: trimmed }, { h }, pageSize);
      session.commit('텍스트 편집', [{ kind: 'update', before: object, after }]);
    }
    setEditing(null);
  }

  function commitNote(note: NoteObject, content: string) {
    const trimmed = content.replace(/\s+$/g, '');
    if (trimmed !== note.content) {
      session.commit('노트 편집', [
        { kind: 'update', before: note, after: { ...note, content: trimmed } },
      ]);
    }
    setEditing(null);
  }

  const pageRotation = pageSize.rotation;
  const placement = (x: number, y: number, extraRotation = 0): CSSProperties => {
    const origin = applyMatrix(matrix, { x, y });
    return {
      position: 'absolute',
      left: 0,
      top: 0,
      transform: `translate(${origin.x}px, ${origin.y}px) rotate(${pageRotation + extraRotation}deg)`,
      transformOrigin: '0 0',
    };
  };

  const items: TextObject[] = draft ? [...texts, draft] : texts;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none', fontFamily: `${TEXT_FONT_FAMILY}, system-ui, sans-serif` }}
      data-text-layer={pageIndex}
    >
      {items.map((text) => {
        const isDraft = draft?.id === text.id;
        const isEditing = editingId === text.id || isDraft;
        const active = isSelected(text.id) || isDraft;
        const pos = live?.id === text.id ? { x: live.x, y: live.y, w: live.w ?? text.w } : text;
        const style: CSSProperties = {
          ...placement(pos.x, pos.y, text.rotation),
          width: pos.w * scale,
          minHeight: text.h * scale,
          padding: TEXT_PADDING * scale,
          fontSize: text.fontSize * scale,
          lineHeight: TEXT_LINE_HEIGHT,
          color: text.color,
          background: text.background ?? 'transparent',
          textAlign: text.align,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          boxSizing: 'border-box',
          pointerEvents: selectable || isEditing ? 'auto' : 'none',
          cursor: isEditing ? 'text' : selectable ? 'move' : 'default',
          outline: active ? `${Math.max(1, 1.5)}px solid #4f46e5` : undefined,
          outlineOffset: 1,
          touchAction: 'none',
        };
        return (
          <div
            key={text.id}
            data-text-id={text.id}
            style={style}
            onPointerDown={(e) => beginDrag(e, text, 'move')}
            onPointerMove={onDragMove}
            onPointerUp={onDragEnd}
            onPointerCancel={onDragEnd}
            onDoubleClick={(e) => {
              if (!selectable) return;
              e.stopPropagation();
              select({ pageIndex, id: text.id });
              setEditing(text.id);
            }}
          >
            {isEditing ? (
              <TextEditor
                key={`edit-${text.id}`}
                initial={text.content}
                fontSize={text.fontSize * scale}
                align={text.align}
                color={text.color}
                onCommit={(value, heightPx) => commitText(text, value, heightPx, isDraft)}
                onCancel={() => {
                  if (isDraft) onDraftDone();
                  setEditing(null);
                }}
              />
            ) : (
              <div data-text-content>{text.content}</div>
            )}
            {active && !isEditing && selectable && (
              <span
                role="presentation"
                onPointerDown={(e) => beginDrag(e, text, 'resize')}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                style={{
                  position: 'absolute',
                  right: -7,
                  bottom: -7,
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  background: '#4f46e5',
                  border: '2px solid white',
                  cursor: 'ew-resize',
                  touchAction: 'none',
                }}
                data-resize-handle
              />
            )}
          </div>
        );
      })}

      {notes.map((note) => {
        const active = isSelected(note.id);
        const isEditing = editingId === note.id;
        const pos = live?.id === note.id ? { x: live.x, y: live.y } : note;
        const expanded = !note.collapsed || isEditing;
        return (
          <div
            key={note.id}
            data-note-id={note.id}
            style={{
              ...placement(pos.x, pos.y),
              width: NOTE_SIZE * scale,
              height: NOTE_SIZE * scale,
              pointerEvents: selectable || isEditing ? 'auto' : 'none',
            }}
          >
            <div
              role="img"
              aria-label="스티키 노트"
              onPointerDown={(e) => beginDrag(e, note, 'move')}
              onPointerMove={onDragMove}
              onPointerUp={onDragEnd}
              onPointerCancel={onDragEnd}
              onDoubleClick={(e) => {
                if (!selectable) return;
                e.stopPropagation();
                select({ pageIndex, id: note.id });
                setEditing(note.id);
              }}
              style={{
                width: '100%',
                height: '100%',
                background: note.color,
                borderRadius: 3 * scale,
                boxShadow: active ? '0 0 0 2px #4f46e5' : '0 1px 2px rgba(15,23,42,0.35)',
                cursor: selectable ? 'move' : 'default',
                touchAction: 'none',
                clipPath: 'polygon(0 0, 100% 0, 100% 70%, 70% 100%, 0 100%)',
              }}
            />
            {expanded && (
              <div
                style={{
                  position: 'absolute',
                  left: (NOTE_SIZE + 4) * scale,
                  top: 0,
                  width: NOTE_EXPANDED_WIDTH * scale,
                  padding: TEXT_PADDING * scale,
                  fontSize: NOTE_FONT_SIZE * scale,
                  lineHeight: TEXT_LINE_HEIGHT,
                  background: note.color,
                  color: '#1a1a1f',
                  opacity: 0.95,
                  borderRadius: 3 * scale,
                  whiteSpace: 'pre-wrap',
                  overflowWrap: 'anywhere',
                  boxSizing: 'border-box',
                  boxShadow: '0 1px 3px rgba(15,23,42,0.25)',
                  pointerEvents: isEditing ? 'auto' : 'none',
                  minHeight: NOTE_FONT_SIZE * TEXT_LINE_HEIGHT * scale + TEXT_PADDING * 2 * scale,
                }}
              >
                {isEditing ? (
                  <TextEditor
                    key={`edit-${note.id}`}
                    initial={note.content}
                    fontSize={NOTE_FONT_SIZE * scale}
                    align="left"
                    color="#1a1a1f"
                    onCommit={(value) => commitNote(note, value)}
                    onCancel={() => setEditing(null)}
                  />
                ) : (
                  note.content || <span style={{ opacity: 0.5 }}>내용 없음</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface TextEditorProps {
  initial: string;
  fontSize: number;
  align: TextObject['align'];
  color: string;
  onCommit: (value: string, heightPx: number) => void;
  onCancel: () => void;
}

/** 자동으로 늘어나는 textarea. blur 또는 Ctrl/⌘+Enter로 확정, Escape로 취소 */
function TextEditor({ initial, fontSize, align, color, onCommit, onCancel }: TextEditorProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState(initial);
  const committed = useRef(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, fontSize]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  function commit() {
    if (committed.current) return;
    committed.current = true;
    onCommit(value, ref.current?.scrollHeight ?? 0);
  }

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          committed.current = true;
          onCancel();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          commit();
        }
        e.stopPropagation();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      placeholder="메모를 입력하세요"
      aria-label="텍스트 편집"
      rows={1}
      style={{
        display: 'block',
        width: '100%',
        margin: `-${0}px`,
        padding: 0,
        border: 'none',
        outline: 'none',
        resize: 'none',
        background: 'transparent',
        font: 'inherit',
        fontSize,
        lineHeight: TEXT_LINE_HEIGHT,
        textAlign: align,
        color,
        overflow: 'hidden',
        minHeight: fontSize * TEXT_LINE_HEIGHT,
      }}
    />
  );
}
