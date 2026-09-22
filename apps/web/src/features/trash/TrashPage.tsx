import type { Folder, PdfDocument } from '@pdf-memo/shared';
import { useMemo, useState } from 'react';
import { formatDateTime } from '../../lib/format';
import { useSubscribable } from '../../lib/useSubscribable';
import { storage } from '../../storage';
import { libraryService } from '../library/service';

const EMPTY_FOLDERS: Folder[] = [];
const EMPTY_DOCS: PdfDocument[] = [];

export function TrashPage() {
  const folders = useSubscribable(
    useMemo(() => storage.folders.watchTrashed(), []),
    EMPTY_FOLDERS,
  );
  const documents = useSubscribable(
    useMemo(() => storage.documents.watchTrashed(), []),
    EMPTY_DOCS,
  );
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const empty = folders.length === 0 && documents.length === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">휴지통</h1>
          <p className="mt-1 text-sm text-slate-500">
            여기 있는 항목은 복원할 수 있습니다. 영구 삭제하면 되돌릴 수 없습니다.
          </p>
        </div>
        {!empty && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm('휴지통의 모든 항목을 영구 삭제할까요?')) {
                void run(() => libraryService.emptyTrash());
              }
            }}
            className="rounded-lg border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
          >
            휴지통 비우기
          </button>
        )}
      </header>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {empty && (
        <p className="rounded-2xl border-2 border-dashed border-slate-300 px-6 py-16 text-center text-sm text-slate-500">
          휴지통이 비어 있습니다.
        </p>
      )}

      {folders.length > 0 && (
        <TrashSection title="폴더">
          {folders.map((folder) => (
            <TrashRow
              key={folder.id}
              name={folder.name}
              meta={`삭제: ${folder.deletedAt ? formatDateTime(folder.deletedAt) : ''}`}
              onRestore={() => void run(() => libraryService.restoreFolder(folder.id))}
              onPurge={() => {
                if (window.confirm(`"${folder.name}" 폴더와 그 안의 문서를 영구 삭제할까요?`)) {
                  void run(() => libraryService.purgeFolder(folder.id));
                }
              }}
            />
          ))}
        </TrashSection>
      )}

      {documents.length > 0 && (
        <TrashSection title="문서">
          {documents.map((doc) => (
            <TrashRow
              key={doc.id}
              name={doc.title}
              meta={`${doc.pageCount}쪽 · 삭제: ${doc.deletedAt ? formatDateTime(doc.deletedAt) : ''}`}
              onRestore={() => void run(() => libraryService.restoreDocument(doc.id))}
              onPurge={() => {
                if (window.confirm(`"${doc.title}" 문서를 영구 삭제할까요?`)) {
                  void run(() => libraryService.purgeDocument(doc.id));
                }
              }}
            />
          ))}
        </TrashSection>
      )}
    </div>
  );
}

function TrashSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">{title}</h2>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {children}
      </ul>
    </section>
  );
}

function TrashRow({
  name,
  meta,
  onRestore,
  onPurge,
}: {
  name: string;
  meta: string;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium text-slate-800">{name}</p>
        <p className="text-xs text-slate-500">{meta}</p>
      </div>
      <div className="flex shrink-0 gap-2 text-xs">
        <button
          type="button"
          onClick={onRestore}
          className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50"
        >
          복원
        </button>
        <button
          type="button"
          onClick={onPurge}
          className="rounded-md border border-red-200 px-2 py-1 text-red-700 hover:bg-red-50"
        >
          영구 삭제
        </button>
      </div>
    </li>
  );
}
