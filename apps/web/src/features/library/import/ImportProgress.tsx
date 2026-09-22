import { Link } from 'react-router';
import type { ImportItem } from './useImportQueue';

const STAGE_LABEL: Record<ImportItem['stage'], string> = {
  queued: '대기 중',
  converting: 'PDF로 변환 중',
  hashing: '중복 확인 중',
  analyzing: '페이지 분석 중',
  saving: '저장 중',
};

interface ImportProgressProps {
  items: ImportItem[];
  onDismiss: (id: string) => void;
  onClearFinished: () => void;
}

export function ImportProgress({ items, onDismiss, onClearFinished }: ImportProgressProps) {
  if (items.length === 0) return null;
  const finished = items.filter((i) => i.outcome).length;

  return (
    <aside
      className="fixed right-4 bottom-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white shadow-lg"
      aria-live="polite"
    >
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2 text-sm">
        <span className="font-medium">가져오기</span>
        <span className="text-slate-500">
          {finished}/{items.length}
          {finished > 0 && (
            <button
              type="button"
              onClick={onClearFinished}
              className="ml-3 text-xs text-slate-500 hover:text-slate-900"
            >
              완료 항목 지우기
            </button>
          )}
        </span>
      </header>
      <ul className="max-h-64 overflow-auto p-2 text-sm">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2 rounded-lg px-2 py-1.5">
            <span className="mt-0.5 shrink-0">{statusIcon(item)}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-slate-800" title={item.fileName}>
                {item.fileName}
              </p>
              <p className="text-xs text-slate-500">{statusText(item)}</p>
            </div>
            {item.outcome && (
              <button
                type="button"
                onClick={() => onDismiss(item.id)}
                className="shrink-0 text-xs text-slate-400 hover:text-slate-700"
                aria-label="닫기"
              >
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}

function statusIcon(item: ImportItem) {
  if (!item.outcome)
    return (
      <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
    );
  if (item.outcome.status === 'done') return <span className="text-emerald-600">✓</span>;
  if (item.outcome.status === 'duplicate') return <span className="text-amber-500">≡</span>;
  return <span className="text-red-500">!</span>;
}

function statusText(item: ImportItem) {
  const { outcome } = item;
  if (!outcome) return STAGE_LABEL[item.stage];
  if (outcome.status === 'done') {
    return (
      <>
        완료 ·{' '}
        <Link to={`/d/${outcome.documentId}`} className="text-indigo-600 hover:underline">
          열기
        </Link>
      </>
    );
  }
  if (outcome.status === 'duplicate') {
    return (
      <>
        이미 있는 문서입니다 ·{' '}
        <Link to={`/d/${outcome.existingDocumentId}`} className="text-indigo-600 hover:underline">
          "{outcome.existingTitle}" 열기
        </Link>
      </>
    );
  }
  return <span className="text-red-600">{outcome.message}</span>;
}
