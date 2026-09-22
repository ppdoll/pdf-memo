import { useEffect, useRef, useState } from 'react';
import { canShareFiles } from './download';
import { useExport } from './useExport';

interface ExportMenuProps {
  documentId: string;
  /** 내보내기 직전에 실행 (세션 flush) */
  beforeExport?: () => Promise<void>;
}

const item =
  'block w-full rounded-md px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-50';

/** 뷰어 툴바의 "내보내기" 드롭다운 */
export function ExportMenu({ documentId, beforeExport }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { state, run, clear } = useExport();
  const shareable = canShareFiles();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // 결과 메시지는 잠시 뒤 지운다
  useEffect(() => {
    if (!state.info && !state.error) return;
    const timer = window.setTimeout(clear, state.error ? 8000 : 4000);
    return () => window.clearTimeout(timer);
  }, [state.info, state.error, clear]);

  function choose(kind: 'flattened' | 'original', action: 'download' | 'share') {
    setOpen(false);
    void run(documentId, kind, action, { before: beforeExport });
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      {(state.busy || state.info || state.error) && (
        <span
          className={`hidden max-w-56 truncate text-xs md:inline ${
            state.error ? 'text-red-600' : state.busy ? 'text-amber-600' : 'text-emerald-600'
          }`}
          role="status"
        >
          {state.error ?? state.progress ?? state.info}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={state.busy}
        className="rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {state.busy ? '내보내는 중…' : '내보내기'}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute top-full right-0 z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => choose('flattened', 'download')}
          >
            필기 포함 PDF 저장
          </button>
          {shareable && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => choose('flattened', 'share')}
            >
              필기 포함 PDF 공유…
            </button>
          )}
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => choose('original', 'download')}
          >
            원본 PDF 저장
          </button>
          <p className="px-3 pt-1 pb-1.5 text-[11px] leading-snug text-slate-400">
            필기는 벡터로 구워져 어떤 뷰어에서도 선명합니다. 원본은 가져온 파일 그대로입니다.
          </p>
        </div>
      )}
    </div>
  );
}
