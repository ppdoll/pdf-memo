import { ROOT_FOLDER_ID, createFolder, type Folder } from '@pdf-memo/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useSubscribable } from '../../lib/useSubscribable';
import { storage } from '../../storage';

const EMPTY: Folder[] = [];

export function FolderPanel({ parentId }: { parentId: string }) {
  const source = useMemo(() => storage.folders.watchChildren(parentId), [parentId]);
  const folders = useSubscribable(source, EMPTY);
  const [path, setPath] = useState<Folder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    storage.folders
      .path(parentId)
      .then((p) => {
        if (!cancelled) setPath(p);
      })
      .catch((e: unknown) => console.error(e));
    return () => {
      cancelled = true;
    };
  }, [parentId, folders]);

  async function onCreate() {
    const name = window.prompt('새 폴더 이름');
    if (!name?.trim()) return;
    try {
      const last = folders.at(-1);
      await storage.folders.put(
        createFolder({ name, parentId, sortKey: generateKeyBetween(last?.sortKey ?? null, null) }),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function onTrash(folder: Folder) {
    if (!window.confirm(`"${folder.name}" 폴더를 휴지통으로 보낼까요?`)) return;
    await storage.folders.softDelete(folder.id);
  }

  const parentLink =
    path.length === 0 ? null : path.length === 1 ? '/' : `/f/${path[path.length - 2].id}`;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <nav className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        <Link to="/" className="hover:text-slate-900">
          내 문서
        </Link>
        {path.map((f) => (
          <span key={f.id} className="flex items-center gap-1">
            <span aria-hidden>/</span>
            <Link to={`/f/${f.id}`} className="hover:text-slate-900">
              {f.name}
            </Link>
          </span>
        ))}
      </nav>

      <div className="mt-3 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          {path.length === 0 ? '내 문서' : path[path.length - 1].name}
        </h1>
        <div className="flex gap-2">
          {parentLink && (
            <Link
              to={parentLink}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              상위 폴더
            </Link>
          )}
          <button
            type="button"
            onClick={onCreate}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            새 폴더
          </button>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {folders.length === 0 ? (
        <p className="mt-8 text-center text-sm text-slate-500">
          폴더가 없습니다. "새 폴더"로 시작하세요.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {folders.map((folder) => (
            <li
              key={folder.id}
              className="group flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 hover:border-indigo-300 hover:bg-indigo-50/40"
            >
              <Link to={`/f/${folder.id}`} className="flex min-w-0 items-center gap-2">
                <span
                  className="inline-block h-3 w-3 shrink-0 rounded-sm"
                  style={{ background: folder.color ?? '#a5b4fc' }}
                />
                <span className="truncate text-sm font-medium">{folder.name}</span>
              </Link>
              <button
                type="button"
                onClick={() => onTrash(folder)}
                className="text-xs text-slate-400 opacity-0 transition group-hover:opacity-100 hover:text-red-600"
                aria-label={`${folder.name} 휴지통으로`}
              >
                휴지통
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-6 text-xs text-slate-400">
        PDF 가져오기와 문서 목록은 Phase 1에서 추가됩니다. 현재 폴더 id:{' '}
        <code>{parentId === ROOT_FOLDER_ID ? 'root' : parentId}</code>
      </p>
    </section>
  );
}
