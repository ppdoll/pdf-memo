import type { Folder } from '@pdf-memo/shared';
import { Link } from 'react-router';
import { FolderIcon } from './FolderIcon';

interface FolderGridProps {
  folders: Folder[];
  onRename: (folder: Folder) => void;
  onTrash: (folder: Folder) => void;
  /** 앞의 아이콘을 눌렀을 때 (색·이미지 바꾸기) */
  onCustomize: (folder: Folder) => void;
}

export function FolderGrid({ folders, onRename, onTrash, onCustomize }: FolderGridProps) {
  if (folders.length === 0) return null;
  return (
    <section>
      <h2 className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">폴더</h2>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {folders.map((folder) => (
          <li
            key={folder.id}
            className="group flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 hover:border-indigo-300 hover:bg-indigo-50/40"
          >
            <button
              type="button"
              onClick={() => onCustomize(folder)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-slate-100"
              title="아이콘 바꾸기 (색 또는 이미지)"
              aria-label={`${folder.name} 아이콘 바꾸기`}
              data-folder-icon-button={folder.id}
            >
              <FolderIcon folder={folder} size={16} />
            </button>
            <Link
              to={`/f/${folder.id}`}
              className="min-w-0 flex-1 truncate text-sm font-medium"
              title={folder.name}
            >
              {folder.name}
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
