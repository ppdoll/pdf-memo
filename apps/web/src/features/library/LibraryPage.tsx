import { ROOT_FOLDER_ID, createFolder, type Folder, type PdfDocument } from '@pdf-memo/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router';
import { useSubscribable } from '../../lib/useSubscribable';
import { storage } from '../../storage';
import { BackupReminder } from '../backup/BackupReminder';
import { useExport } from '../export/useExport';
import { DocumentCard } from './DocumentCard';
import { FolderGrid } from './FolderGrid';
import { Dropzone } from './import/Dropzone';
import { ImportProgress } from './import/ImportProgress';
import { useImportQueue } from './import/useImportQueue';
import { RecentDocuments } from './RecentDocuments';
import { libraryService } from './service';

const EMPTY_FOLDERS: Folder[] = [];
const EMPTY_DOCS: PdfDocument[] = [];

export function LibraryPage() {
  const { folderId = ROOT_FOLDER_ID } = useParams<{ folderId: string }>();
  const foldersSource = useMemo(() => storage.folders.watchChildren(folderId), [folderId]);
  const folders = useSubscribable(foldersSource, EMPTY_FOLDERS);
  const docsSource = useMemo(() => storage.documents.watchInFolder(folderId), [folderId]);
  const documents = useSubscribable(docsSource, EMPTY_DOCS);
  const path = useFolderPath(folderId, folders);
  const { items, importFiles, dismiss, clearFinished } = useImportQueue();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const exporter = useExport();

  const isRoot = folderId === ROOT_FOLDER_ID;
  const title = isRoot ? '내 문서' : (path[path.length - 1]?.name ?? '폴더');
  const parentHref =
    path.length === 0 ? null : path.length === 1 ? '/' : `/f/${path[path.length - 2].id}`;

  async function run(action: () => Promise<unknown>) {
    try {
      await action();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function onNewFolder() {
    const name = window.prompt('새 폴더 이름');
    if (!name?.trim()) return;
    const last = folders.at(-1);
    void run(() =>
      storage.folders.put(
        createFolder({
          name,
          parentId: folderId,
          sortKey: generateKeyBetween(last?.sortKey ?? null, null),
        }),
      ),
    );
  }

  function onRenameFolder(folder: Folder) {
    const name = window.prompt('폴더 이름', folder.name);
    if (name === null) return;
    void run(() => libraryService.renameFolder(folder.id, name));
  }

  function onTrashFolder(folder: Folder) {
    if (!window.confirm(`"${folder.name}" 폴더와 그 안의 문서를 휴지통으로 보낼까요?`)) return;
    void run(() => libraryService.trashFolder(folder.id));
  }

  function onRenameDocument(doc: PdfDocument) {
    const name = window.prompt('문서 이름', doc.title);
    if (name === null) return;
    void run(() => libraryService.renameDocument(doc.id, name));
  }

  function onTrashDocument(doc: PdfDocument) {
    if (!window.confirm(`"${doc.title}" 문서를 휴지통으로 보낼까요?`)) return;
    void run(() => libraryService.trashDocument(doc.id));
  }

  function onExportDocument(doc: PdfDocument) {
    void exporter.run(doc.id, 'flattened', 'download');
  }

  function onPickFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    importFiles(files, folderId);
  }

  const empty = folders.length === 0 && documents.length === 0;

  return (
    <Dropzone onFiles={(files) => importFiles(files, folderId)}>
      <div className="space-y-6">
        <header>
          <nav
            className="flex flex-wrap items-center gap-1 text-sm text-slate-500"
            aria-label="경로"
          >
            <Link to="/" className="hover:text-slate-900">
              내 문서
            </Link>
            {path.map((folder) => (
              <span key={folder.id} className="flex items-center gap-1">
                <span aria-hidden>/</span>
                <Link to={`/f/${folder.id}`} className="hover:text-slate-900">
                  {folder.name}
                </Link>
              </span>
            ))}
          </nav>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-semibold">{title}</h1>
            <div className="flex gap-2">
              {parentHref && (
                <Link
                  to={parentHref}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
                >
                  상위 폴더
                </Link>
              )}
              <button
                type="button"
                onClick={onNewFolder}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                새 폴더
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="PDF, 마크다운(.md), 텍스트(.txt) 파일을 가져옵니다"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                가져오기
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf,.md,.markdown,.txt,text/markdown,text/plain"
                multiple
                hidden
                onChange={onPickFiles}
              />
            </div>
          </div>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          {(exporter.state.busy || exporter.state.info || exporter.state.error) && (
            <p
              className={`mt-2 text-sm ${
                exporter.state.error
                  ? 'text-red-600'
                  : exporter.state.busy
                    ? 'text-amber-600'
                    : 'text-emerald-600'
              }`}
              role="status"
            >
              {exporter.state.error ?? exporter.state.progress ?? exporter.state.info}
            </p>
          )}
        </header>

        {isRoot && <BackupReminder documentCount={documents.length} />}

        {isRoot && <RecentDocuments />}

        <FolderGrid folders={folders} onRename={onRenameFolder} onTrash={onTrashFolder} />

        {documents.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">
              문서
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {documents.map((doc) => (
                <DocumentCard
                  key={doc.id}
                  doc={doc}
                  onRename={onRenameDocument}
                  onTrash={onTrashDocument}
                  onExport={onExportDocument}
                  exporting={exporter.state.busy && exporter.state.documentId === doc.id}
                />
              ))}
            </ul>
          </section>
        )}

        {empty && (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 px-6 py-16 text-center">
            <p className="text-sm text-slate-600">
              PDF나 마크다운(.md) 파일을 여기에 끌어다 놓거나 "가져오기"를 누르세요.
            </p>
            <p className="mt-1 text-xs text-slate-400">
              파일은 이 브라우저 안에만 저장되고 서버로 올라가지 않습니다.
            </p>
          </div>
        )}
      </div>

      <ImportProgress items={items} onDismiss={dismiss} onClearFinished={clearFinished} />
    </Dropzone>
  );
}

function useFolderPath(folderId: string, folders: Folder[]): Folder[] {
  const [path, setPath] = useState<Folder[]>([]);
  useEffect(() => {
    let cancelled = false;
    storage.folders
      .path(folderId)
      .then((p) => {
        if (!cancelled) setPath(p);
      })
      .catch((error: unknown) => console.error('[useFolderPath]', error));
    return () => {
      cancelled = true;
    };
  }, [folderId, folders]);
  return path;
}
