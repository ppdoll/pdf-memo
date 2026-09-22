import type { InkTool } from '@pdf-memo/shared';
import { useSessionStatus } from './hooks';
import type { AnnotationSession } from './session';
import {
  ERASER_RADII,
  INK_COLORS,
  INK_WIDTHS,
  isInkTool,
  useToolStore,
  type Tool,
} from './toolStore';

const TOOL_BUTTONS: Array<{ tool: Tool; label: string; key: string }> = [
  { tool: 'pen', label: '펜', key: 'P' },
  { tool: 'highlighter', label: '형광펜', key: 'H' },
  { tool: 'marker', label: '마커', key: 'M' },
  { tool: 'eraser', label: '지우개', key: 'E' },
  { tool: 'hand', label: '손', key: 'V' },
];

const chip = 'rounded-md px-2.5 py-1 text-sm transition';
const chipActive = 'bg-indigo-600 text-white';
const chipIdle = 'text-slate-700 hover:bg-slate-100';

interface AnnotationToolbarProps {
  session: AnnotationSession;
}

export function AnnotationToolbar({ session }: AnnotationToolbarProps) {
  const tool = useToolStore((s) => s.tool);
  const setTool = useToolStore((s) => s.setTool);
  const setInk = useToolStore((s) => s.setInk);
  const eraserRadius = useToolStore((s) => s.eraserRadius);
  const setEraserRadius = useToolStore((s) => s.setEraserRadius);
  const fingerDraws = useToolStore((s) => s.fingerDraws);
  const setFingerDraws = useToolStore((s) => s.setFingerDraws);
  const inkSettings = useToolStore((s) => (isInkTool(s.tool) ? s[s.tool] : null));
  const status = useSessionStatus(session);
  const inkTool: InkTool | null = isInkTool(tool) ? tool : null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-200 bg-white px-2 py-1.5 sm:px-3"
      role="toolbar"
      aria-label="필기 도구"
    >
      <div className="flex items-center gap-0.5 rounded-lg bg-slate-50 p-0.5">
        {TOOL_BUTTONS.map((b) => (
          <button
            key={b.tool}
            type="button"
            onClick={() => setTool(b.tool)}
            className={`${chip} ${tool === b.tool ? chipActive : chipIdle}`}
            title={`${b.label} (${b.key})`}
            aria-pressed={tool === b.tool}
          >
            {b.label}
          </button>
        ))}
      </div>

      {inkTool && inkSettings && (
        <>
          <div className="flex items-center gap-1" aria-label="색상">
            {INK_COLORS[inkTool].map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setInk(inkTool, { color })}
                className={`h-6 w-6 rounded-full border transition ${
                  inkSettings.color === color
                    ? 'border-slate-900 ring-2 ring-indigo-300 ring-offset-1'
                    : 'border-slate-300 hover:scale-110'
                }`}
                style={{ background: color }}
                aria-label={`색 ${color}`}
                aria-pressed={inkSettings.color === color}
              />
            ))}
            <label
              className="relative h-6 w-6 cursor-pointer overflow-hidden rounded-full border border-dashed border-slate-400"
              title="직접 선택"
            >
              <span
                className="absolute inset-0"
                style={{
                  background:
                    'conic-gradient(#ef4444, #f59e0b, #22c55e, #3b82f6, #a855f7, #ef4444)',
                }}
              />
              <input
                type="color"
                value={inkSettings.color}
                onChange={(e) => setInk(inkTool, { color: e.target.value })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="색 직접 선택"
              />
            </label>
          </div>

          <div className="flex items-center gap-1" aria-label="굵기">
            {INK_WIDTHS[inkTool].map((width) => (
              <button
                key={width}
                type="button"
                onClick={() => setInk(inkTool, { width })}
                className={`flex h-7 w-7 items-center justify-center rounded-md ${
                  inkSettings.width === width
                    ? 'bg-indigo-50 ring-1 ring-indigo-400'
                    : 'hover:bg-slate-100'
                }`}
                title={`${width}pt`}
                aria-pressed={inkSettings.width === width}
              >
                <span
                  className="rounded-full bg-slate-800"
                  style={{
                    width: Math.min(18, 3 + width * (inkTool === 'highlighter' ? 0.55 : 2)),
                    height: Math.min(18, 3 + width * (inkTool === 'highlighter' ? 0.55 : 2)),
                  }}
                />
              </button>
            ))}
          </div>
        </>
      )}

      {tool === 'eraser' && (
        <div className="flex items-center gap-1" aria-label="지우개 크기">
          {ERASER_RADII.map((radius) => (
            <button
              key={radius}
              type="button"
              onClick={() => setEraserRadius(radius)}
              className={`flex h-7 w-7 items-center justify-center rounded-md ${
                eraserRadius === radius
                  ? 'bg-indigo-50 ring-1 ring-indigo-400'
                  : 'hover:bg-slate-100'
              }`}
              title={`${radius}pt`}
              aria-pressed={eraserRadius === radius}
            >
              <span
                className="rounded-full border-2 border-slate-600"
                style={{ width: 4 + radius, height: 4 + radius }}
              />
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => session.undo()}
          disabled={!status.canUndo}
          className={`${chip} ${chipIdle} disabled:opacity-40 disabled:hover:bg-transparent`}
          title="실행 취소 (Ctrl+Z)"
        >
          ↶ 취소
        </button>
        <button
          type="button"
          onClick={() => session.redo()}
          disabled={!status.canRedo}
          className={`${chip} ${chipIdle} disabled:opacity-40 disabled:hover:bg-transparent`}
          title="다시 실행 (Ctrl+Shift+Z)"
        >
          ↷ 재실행
        </button>
      </div>

      <label
        className="ml-auto flex items-center gap-1.5 text-xs text-slate-600"
        title="켜면 손가락도 펜처럼 그립니다. 끄면 손가락은 스크롤과 확대에 씁니다"
      >
        <input
          type="checkbox"
          checked={fingerDraws}
          onChange={(e) => setFingerDraws(e.target.checked)}
          className="h-3.5 w-3.5 accent-indigo-600"
        />
        손가락으로 그리기
      </label>

      <span
        className={`text-xs ${status.error ? 'text-red-600' : status.pending > 0 ? 'text-amber-600' : 'text-slate-400'}`}
        aria-live="polite"
      >
        {status.error ? `저장 오류: ${status.error}` : status.pending > 0 ? '저장 중…' : '저장됨'}
      </span>
    </div>
  );
}
