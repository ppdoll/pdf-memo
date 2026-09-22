import type { Folder } from '@pdf-memo/shared';
import { Link } from 'react-router';

interface FolderGridProps {
  folders: Folder[];
  onRename: (folder: Folder) => void;
  onTrash: (folder: Folder) => void;
}

export function FolderGrid({ folders, onRename, onTrash }: FolderGridProps) {
  if (folders.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">폴더</h2>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {folders.map((folder) => (
          <li
            key={folder.id}
            className="group flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <Link to={`/f/${folder.id}`} className="flex min-w-0 flex-1 items-center gap-2">
              <span
                className="inline-block h-3 w-3 shrink-0 rounded-sm"
                style={{ background: folder.color ?? '#a5b4fc' }}
              />
              <span className="truncate text-sm font-medium">{folder.name}</span>
            </Link>
            <div className="flex gap-2 text-xs text-slate-400 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
              <button
                type="button"
                onClick={() => onRename(folder)}
                className="hover:text-slate-900"
              >
                이름
              </button>
              <button
                type="button"
                onClick={() => onTrash(folder)}
                className="hover:text-red-600"
                aria-label={`${folder.name} 휴지통으로`}
              >
                휴지통
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
