import type { Folder } from '@pdf-memo/shared';
import { useEffect, useRef, useState } from 'react';
import { storage } from '../../storage';
import { FolderIcon } from './FolderIcon';
import { FOLDER_COLORS, createFolderIconAsset } from './folderIconAsset';

export interface FolderIconPatch {
  color?: string | null;
  iconAssetId?: string | null;
}

interface FolderIconEditorProps {
  folder: Folder;
  onChange: (patch: FolderIconPatch) => void | Promise<void>;
  onClose: () => void;
}

/** 폴더 아이콘 편집 대화상자: 색 고르기, 직접 색 입력, 이미지 넣기, 기본으로 되돌리기 */
export function FolderIconEditor({ folder, onChange, onClose }: FolderIconEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function onFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const asset = await createFolderIconAsset(storage, file);
      await onChange({ iconAssetId: asset.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : '이미지를 넣을 수 없습니다');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const currentColor = folder.color ?? FOLDER_COLORS[0];
  const hasImage = Boolean(folder.iconAssetId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-icon-title"
      data-folder-icon-editor
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <FolderIcon folder={folder} size={40} className="rounded-md" />
          <div className="min-w-0">
            <h2 id="folder-icon-title" className="text-base font-semibold text-slate-900">
              폴더 아이콘
            </h2>
            <p className="truncate text-sm text-slate-500" title={folder.name}>
              {folder.name}
            </p>
          </div>
        </div>

        <p className="mt-4 text-xs font-medium text-slate-500">색</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5" aria-label="색 고르기">
          {FOLDER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => void onChange({ color, iconAssetId: null })}
              className={`h-7 w-7 rounded-md border transition ${
                !hasImage && currentColor === color
                  ? 'border-slate-900 ring-2 ring-indigo-300 ring-offset-1'
                  : 'border-slate-300 hover:scale-110'
              }`}
              style={{ background: color }}
              aria-label={`색 ${color}`}
              aria-pressed={!hasImage && currentColor === color}
              data-folder-color={color}
            />
          ))}
          <label
            className="relative h-7 w-7 cursor-pointer overflow-hidden rounded-md border border-dashed border-slate-400"
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
              value={currentColor}
              onChange={(e) => void onChange({ color: e.target.value, iconAssetId: null })}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="색 직접 선택"
            />
          </label>
        </div>

        <p className="mt-4 text-xs font-medium text-slate-500">이미지</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy ? '넣는 중…' : hasImage ? '다른 이미지 선택' : '이미지 선택'}
          </button>
          {hasImage && (
            <button
              type="button"
              onClick={() => void onChange({ iconAssetId: null })}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              이미지 지우기
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void onFile(e.target.files)}
            data-folder-icon-file
          />
        </div>
        <p className="mt-1 text-xs text-slate-500">가운데를 정사각형으로 잘라 작게 저장합니다.</p>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => void onChange({ color: null, iconAssetId: null })}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
          >
            기본으로
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            완료
          </button>
        </div>
      </div>
    </div>
  );
}
