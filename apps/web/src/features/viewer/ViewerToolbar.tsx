import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router';

interface ViewerToolbarProps {
  title: string;
  backHref: string;
  currentPage: number;
  pageCount: number;
  scalePercent: number;
  fitWidth: boolean;
  onGoToPage: (pageIndex: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onActualSize: () => void;
  /** 오른쪽 끝에 붙는 추가 컨트롤 (내보내기 메뉴 등) */
  trailing?: ReactNode;
}

const iconButton =
  'rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent';

export function ViewerToolbar({
  title,
  backHref,
  currentPage,
  pageCount,
  scalePercent,
  fitWidth,
  onGoToPage,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onActualSize,
  trailing,
}: ViewerToolbarProps) {
  const [pageInput, setPageInput] = useState(String(currentPage + 1));

  useEffect(() => {
    setPageInput(String(currentPage + 1));
  }, [currentPage]);

  function submitPage() {
    const number = Number.parseInt(pageInput, 10);
    if (Number.isFinite(number)) {
      onGoToPage(Math.min(Math.max(number, 1), pageCount) - 1);
    } else {
      setPageInput(String(currentPage + 1));
    }
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-2 sm:px-3">
      <Link
        to={backHref}
        className="rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
        aria-label="라이브러리로 돌아가기"
      >
        ← 라이브러리
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium" title={title}>
        {title}
      </h1>

      <div className="flex items-center gap-1 text-sm text-slate-600">
        <button
          type="button"
          className={iconButton}
          onClick={() => onGoToPage(currentPage - 1)}
          disabled={currentPage <= 0}
          aria-label="이전 페이지"
        >
          ‹
        </button>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={pageCount}
          value={pageInput}
          onChange={(e) => setPageInput(e.target.value)}
          onBlur={submitPage}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-12 rounded-md border border-slate-300 px-1 py-0.5 text-center text-sm"
          aria-label="페이지 번호"
        />
        <span className="text-slate-400">/ {pageCount}</span>
        <button
          type="button"
          className={iconButton}
          onClick={() => onGoToPage(currentPage + 1)}
          disabled={currentPage >= pageCount - 1}
          aria-label="다음 페이지"
        >
          ›
        </button>
      </div>

      <div className="hidden items-center gap-1 sm:flex">
        <button type="button" className={iconButton} onClick={onZoomOut} aria-label="축소">
          −
        </button>
        <button
          type="button"
          className="w-14 rounded-md px-1 py-1 text-center text-sm text-slate-700 hover:bg-slate-100"
          onClick={onActualSize}
          title="실제 크기 (100%)"
        >
          {scalePercent}%
        </button>
        <button type="button" className={iconButton} onClick={onZoomIn} aria-label="확대">
          +
        </button>
        <button
          type="button"
          onClick={onFitWidth}
          className={`${iconButton} ${fitWidth ? 'bg-indigo-50 text-indigo-700' : ''}`}
          title="폭 맞춤"
        >
          폭 맞춤
        </button>
      </div>
      {trailing}
    </header>
  );
}
