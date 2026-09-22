import type { NoteObject, TextObject } from '@pdf-memo/shared';
import type { AnnotationSession } from '../annotate/session';
import { INK_COLORS, useToolStore } from '../annotate/toolStore';
import { useSelectedObject } from './hooks';
import {
  FONT_SIZES,
  NOTE_COLORS,
  TEXT_BACKGROUNDS,
  type TextAlign,
  type TextDefaults,
} from './model';
import { useSelectionStore } from './selectionStore';

const chip = 'rounded-md px-2 py-1 text-xs transition';
const active = 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-400';
const idle = 'text-slate-700 hover:bg-slate-100';

const ALIGN_LABEL: Record<TextAlign, string> = { left: '좌', center: '중', right: '우' };

/**
 * 텍스트·노트 서식 컨트롤. 객체가 선택되어 있으면 그 객체를 바꾸고(Undo 가능),
 * 아니면 새로 만들 객체의 기본값을 바꾼다.
 */
export function TextControls({ session }: { session: AnnotationSession }) {
  const tool = useToolStore((s) => s.tool);
  const defaults = useToolStore((s) => s.text);
  const setText = useToolStore((s) => s.setText);
  const noteDefaults = useToolStore((s) => s.note);
  const setNote = useToolStore((s) => s.setNote);
  const select = useSelectionStore((s) => s.select);
  const target = useSelectedObject(session);
  const textTarget = target?.type === 'text' ? (target as TextObject) : null;
  const noteTarget = target?.type === 'note' ? (target as NoteObject) : null;

  const showText = tool === 'text' || textTarget !== null;
  const showNote = tool === 'note' || noteTarget !== null;
  if (!showText && !showNote) return null;

  const current: TextDefaults = textTarget
    ? {
        color: textTarget.color,
        fontSize: textTarget.fontSize,
        background: textTarget.background,
        align: textTarget.align,
      }
    : defaults;

  function applyText(patch: Partial<TextDefaults>) {
    setText(patch);
    if (textTarget) {
      session.commit('텍스트 서식', [
        { kind: 'update', before: textTarget, after: { ...textTarget, ...patch } },
      ]);
    }
  }

  function applyNoteColor(color: string) {
    setNote({ color });
    if (noteTarget) {
      session.commit('노트 색', [
        { kind: 'update', before: noteTarget, after: { ...noteTarget, color } },
      ]);
    }
  }

  function removeSelected() {
    if (!target) return;
    session.commit('삭제', [{ kind: 'remove', object: target }]);
    select(null);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-text-controls>
      {showText && (
        <>
          <div className="flex items-center gap-0.5" aria-label="글자 크기">
            {FONT_SIZES.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => applyText({ fontSize: size })}
                className={`${chip} ${current.fontSize === size ? active : idle}`}
                aria-pressed={current.fontSize === size}
              >
                {size}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1" aria-label="글자 색">
            {INK_COLORS.pen.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => applyText({ color })}
                className={`h-5 w-5 rounded-full border ${
                  current.color === color
                    ? 'border-slate-900 ring-2 ring-indigo-300 ring-offset-1'
                    : 'border-slate-300 hover:scale-110'
                }`}
                style={{ background: color }}
                aria-label={`글자 색 ${color}`}
                aria-pressed={current.color === color}
              />
            ))}
          </div>
          <div className="flex items-center gap-0.5" aria-label="배경">
            {TEXT_BACKGROUNDS.map((bg) => (
              <button
                key={bg.label}
                type="button"
                onClick={() => applyText({ background: bg.value })}
                className={`${chip} ${current.background === bg.value ? active : idle}`}
                style={bg.value ? { boxShadow: `inset 0 -3px 0 ${bg.value}` } : undefined}
                aria-pressed={current.background === bg.value}
              >
                {bg.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5" aria-label="정렬">
            {(Object.keys(ALIGN_LABEL) as TextAlign[]).map((align) => (
              <button
                key={align}
                type="button"
                onClick={() => applyText({ align })}
                className={`${chip} ${current.align === align ? active : idle}`}
                aria-pressed={current.align === align}
                title={`${ALIGN_LABEL[align]} 정렬`}
              >
                {ALIGN_LABEL[align]}
              </button>
            ))}
          </div>
        </>
      )}

      {showNote && (
        <div className="flex items-center gap-1" aria-label="노트 색">
          {NOTE_COLORS.map((color) => {
            const selectedColor = noteTarget ? noteTarget.color : noteDefaults.color;
            return (
              <button
                key={color}
                type="button"
                onClick={() => applyNoteColor(color)}
                className={`h-5 w-5 rounded-sm border ${
                  selectedColor === color
                    ? 'border-slate-900 ring-2 ring-indigo-300 ring-offset-1'
                    : 'border-slate-300 hover:scale-110'
                }`}
                style={{ background: color }}
                aria-label={`노트 색 ${color}`}
                aria-pressed={selectedColor === color}
              />
            );
          })}
        </div>
      )}

      {target && (
        <button
          type="button"
          onClick={removeSelected}
          className={`${chip} text-red-600 hover:bg-red-50`}
          title="선택한 객체 삭제 (Delete)"
        >
          삭제
        </button>
      )}
    </div>
  );
}
