import { ROOT_FOLDER_ID, type PdfDocument } from '@pdf-memo/shared';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatBytes } from '../../lib/quota';
import { storage } from '../../storage';
import { downloadFile } from '../export/download';
import { importPdfFile } from '../library/import/importPdf';
import { analyzePdf } from '../viewer/pdf/analyze';
import { JsonTree, type TreeContext } from './JsonTree';
import { findMatches, toPrettyJson, describeJsonError, type JsonValue } from './model';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; value: JsonValue; text: string }
  | { status: 'error'; message: string };

const DEFAULT_DEPTH = 2;

interface JsonDocumentPageProps {
  doc: PdfDocument;
  blob: Blob | null;
}

/** JSON 문서 뷰어: 접기/펼치기 트리, 찾기, 원본 저장, PDF로 만들기 */
export function JsonDocumentPage({ doc, blob }: JsonDocumentPageProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [defaultDepth, setDefaultDepth] = useState(DEFAULT_DEPTH);
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    setState({ status: 'loading' });
    blob
      .text()
      .then((text) => {
        if (cancelled) return;
        try {
          setState({ status: 'ready', value: JSON.parse(text) as JsonValue, text });
        } catch (error) {
          setState({ status: 'error', message: describeJsonError(error, text) });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setState({ status: 'error', message: String(error) });
      });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  const find = useMemo(() => {
    if (state.status !== 'ready' || debounced.trim().length === 0) return null;
    return findMatches(state.value, debounced);
  }, [state, debounced]);

  const onToggle = useCallback((path: string, expanded: boolean) => {
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(path, expanded);
      return next;
    });
  }, []);

  function expandAll() {
    setDefaultDepth(Number.POSITIVE_INFINITY);
    setOverrides(new Map());
  }

  function collapseAll() {
    setDefaultDepth(1);
    setOverrides(new Map());
  }

  const ctx: TreeContext = {
    defaultDepth,
    overrides,
    onToggle,
    query: debounced,
    matches: find?.matches ?? null,
    expandForFind: find?.expand ?? null,
  };

  const safeName = doc.title.replace(/[\\/:*?"<>|]/g, ' ').trim() || 'data';

  function saveJson() {
    if (!blob) return;
    downloadFile(new File([blob], `${safeName}.json`, { type: 'application/json' }));
  }

  async function makePdf() {
    if (state.status !== 'ready') return;
    setBusy('PDF로 만드는 중…');
    setNotice(null);
    try {
      const markdown = `# ${doc.title}\n\n\`\`\`json\n${toPrettyJson(state.value)}\n\`\`\`\n`;
      const { markdownFileToPdf } = await import('../import/markdown/markdownToPdf');
      const converted = await markdownFileToPdf(
        new File([markdown], `${safeName}.md`, { type: 'text/markdown' }),
      );
      const outcome = await importPdfFile(converted.file, {
        storage,
        analyze: analyzePdf,
        folderId: doc.folderId,
        title: `${doc.title} (PDF)`,
        originalFileName: doc.originalFileName,
      });
      if (outcome.status === 'done') navigate(`/d/${outcome.documentId}`);
      else if (outcome.status === 'duplicate') navigate(`/d/${outcome.existingDocumentId}`);
      else setNotice(outcome.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const backHref = doc.folderId === ROOT_FOLDER_ID ? '/' : `/f/${doc.folderId}`;
  const chip = 'rounded-md px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100';

  return (
    <div className="flex h-dvh flex-col bg-slate-50">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-slate-200 bg-white px-2 py-1.5 sm:px-3">
        <Link to={backHref} className={chip} aria-label="라이브러리로">
          ← 목록
        </Link>
        <h1
          className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900"
          title={doc.title}
        >
          {doc.title}
          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
            JSON
          </span>
          <span className="ml-2 text-xs font-normal text-slate-500">
            {formatBytes(doc.byteSize)}
          </span>
        </h1>
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={expandAll} className={chip} data-json-expand-all>
            모두 펼치기
          </button>
          <button type="button" onClick={collapseAll} className={chip} data-json-collapse-all>
            모두 접기
          </button>
        </div>
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">찾기</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="키·값 찾기"
            className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm"
            data-json-find
          />
          {find && (
            <span className="text-xs text-slate-500" aria-live="polite" data-json-find-count>
              {find.total}건{find.truncated ? '+' : ''}
            </span>
          )}
        </label>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void makePdf()}
            disabled={busy !== null || state.status !== 'ready'}
            className={`${chip} disabled:opacity-50`}
            title="정리된 JSON을 PDF 문서로 만들어 필기할 수 있게 합니다"
          >
            {busy ?? 'PDF로 만들기'}
          </button>
          <button type="button" onClick={saveJson} disabled={!blob} className={chip}>
            JSON 저장
          </button>
        </div>
      </header>
      {notice && (
        <p
          className="border-b border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700"
          role="alert"
        >
          {notice}
        </p>
      )}
      <main className="min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-5">
        {state.status === 'loading' && <p className="text-sm text-slate-500">JSON을 읽는 중…</p>}
        {state.status === 'error' && (
          <p className="text-sm text-red-600" role="alert">
            {state.message}
          </p>
        )}
        {state.status === 'ready' && (
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <JsonTree value={state.value} ctx={ctx} />
          </div>
        )}
      </main>
    </div>
  );
}
