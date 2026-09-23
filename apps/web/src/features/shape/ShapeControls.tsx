import type { ShapeObject } from '@pdf-memo/shared';
import type { AnnotationSession } from '../annotate/session';
import { INK_COLORS, useToolStore } from '../annotate/toolStore';
import { useSelectedObject } from '../text/hooks';
import { useSelectionStore } from '../text/selectionStore';
import {
  SHAPE_DASH,
  SHAPE_FILLS,
  SHAPE_KINDS,
  SHAPE_WIDTHS,
  isLinear,
  shapeBBox,
  type ShapeDefaults,
} from './model';

const chip = 'rounded-md px-2 py-1 text-xs transition';
const active = 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-400';
const idle = 'text-slate-700 hover:bg-slate-100';

/**
 * 도형 서식 컨트롤. 도형이 선택되어 있으면 그 도형을 바꾸고(Undo 가능), 아니면 새로 그릴 기본값을 바꾼다.
 * 종류는 새 도형에만 적용된다(선택한 도형의 종류 변경은 없음).
 */
export function ShapeControls({ session }: { session: AnnotationSession }) {
  const tool = useToolStore((s) => s.tool);
  const defaults = useToolStore((s) => s.shape);
  const setShape = useToolStore((s) => s.setShape);
  const select = useSelectionStore((s) => s.select);
  const target = useSelectedObject(session);
  const shape = target?.type === 'shape' ? (target as ShapeObject) : null;
  if (tool !== 'shape' && !shape) return null;

  const current: ShapeDefaults = shape
    ? {
        kind: shape.shape,
        stroke: shape.stroke,
        strokeWidth: shape.strokeWidth,
        fill: shape.fill,
        dashed: (shape.dash?.length ?? 0) > 0,
      }
    : defaults;
  const linear = isLinear(current.kind);

  function apply(patch: Partial<ShapeDefaults>) {
    setShape(patch);
    if (!shape) return;
    const next: ShapeObject = {
      ...shape,
      stroke: patch.stroke ?? shape.stroke,
      strokeWidth: patch.strokeWidth ?? shape.strokeWidth,
      fill: patch.fill === undefined ? shape.fill : patch.fill,
      dash: patch.dashed === undefined ? shape.dash : patch.dashed ? [...SHAPE_DASH] : null,
    };
    session.commit('도형 서식', [
      { kind: 'update', before: shape, after: { ...next, bbox: shapeBBox(next) } },
    ]);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1" data-shape-controls>
      {!shape && (
        <div className="flex items-center gap-0.5" aria-label="도형 종류">
          {SHAPE_KINDS.map((k) => (
            <button
              key={k.kind}
              type="button"
              onClick={() => setShape({ kind: k.kind })}
              className={`${chip} ${defaults.kind === k.kind ? active : idle}`}
              aria-pressed={defaults.kind === k.kind}
              title={k.label}
              data-shape-kind-button={k.kind}
            >
              <span aria-hidden className="mr-1">
                {k.glyph}
              </span>
              {k.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1" aria-label="선 색">
        {INK_COLORS.pen.map((color) => (
          <button
            key={color}
            type="button"
            onClick={() => apply({ stroke: color })}
            className={`h-5 w-5 rounded-full border ${
              current.stroke === color
                ? 'border-slate-900 ring-2 ring-indigo-300 ring-offset-1'
                : 'border-slate-300 hover:scale-110'
            }`}
            style={{ background: color }}
            aria-label={`선 색 ${color}`}
            aria-pressed={current.stroke === color}
          />
        ))}
        <label
          className="relative h-5 w-5 cursor-pointer overflow-hidden rounded-full border border-dashed border-slate-400"
          title="직접 선택"
        >
          <span
            className="absolute inset-0"
            style={{
              background: 'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)',
            }}
          />
          <input
            type="color"
            value={current.stroke}
            onChange={(e) => apply({ stroke: e.target.value })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            aria-label="선 색 직접 선택"
          />
        </label>
      </div>
      <div className="flex items-center gap-0.5" aria-label="선 굵기">
        {SHAPE_WIDTHS.map((width) => (
          <button
            key={width}
            type="button"
            onClick={() => apply({ strokeWidth: width })}
            className={`flex h-7 w-7 items-center justify-center rounded-md ${
              current.strokeWidth === width
                ? 'bg-indigo-50 ring-1 ring-indigo-400'
                : 'hover:bg-slate-100'
            }`}
            title={`${width}pt`}
            aria-pressed={current.strokeWidth === width}
          >
            <span
              className="rounded-full bg-slate-800"
              style={{ width: 3 + width * 2, height: 3 + width * 2 }}
            />
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => apply({ dashed: !current.dashed })}
        className={`${chip} ${current.dashed ? active : idle}`}
        aria-pressed={current.dashed}
        title="점선"
        data-shape-dash
      >
        {current.dashed ? '점선' : '실선'}
      </button>
      {!linear && (
        <div className="flex items-center gap-1" aria-label="채움">
          <button
            type="button"
            onClick={() => apply({ fill: null })}
            className={`${chip} ${current.fill === null ? active : idle}`}
            aria-pressed={current.fill === null}
          >
            없음
          </button>
          {SHAPE_FILLS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => apply({ fill: color })}
              className={`h-5 w-5 rounded-sm border ${
                current.fill === color
                  ? 'border-slate-900 ring-2 ring-indigo-300 ring-offset-1'
                  : 'border-slate-300 hover:scale-110'
              }`}
              style={{ background: color }}
              aria-label={`채움 ${color}`}
              aria-pressed={current.fill === color}
            />
          ))}
        </div>
      )}
      {shape && (
        <button
          type="button"
          onClick={() => {
            session.commit('삭제', [{ kind: 'remove', object: shape }]);
            select(null);
          }}
          className={`${chip} text-red-600 hover:bg-red-50`}
          title="선택한 도형 삭제 (Delete)"
        >
          삭제
        </button>
      )}
    </div>
  );
}
