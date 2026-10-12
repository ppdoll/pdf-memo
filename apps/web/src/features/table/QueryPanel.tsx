import type { PdfDocument } from '@pdf-memo/shared';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatBytes } from '../../lib/quota';
import { storage } from '../../storage';
import { PARQUET_MIME } from '../import/parquet/detect';
import { importParquetFile, inspectParquet } from '../library/import/importParquet';
import { openQuerySession, type EngineProgress, type QuerySession } from './duckdb';
import type { TableColumn } from './model';
import {
  QUERY_MAX_ROWS,
  SOURCE_TABLE,
  exampleQueries,
  quoteIdentifier,
  tidySqlError,
  type QueryResult,
} from './sql';

interface QueryPanelProps {
  doc: PdfDocument;
  blob: Blob | null;
  sourceColumns: TableColumn[];
  /** 질의 결과(또는 표로 돌아가기 = null) */
  onResult: (result: QueryResult | null) => void;
  onClose: () => void;
}

type EngineState =
  | { status: 'loading'; progress: EngineProgress | null }
  | { status: 'ready' }
  | { status: 'error'; message: string };

const settingsKey = (docId: string) => `table.sql.${docId}`;
const DEFAULT_SQL = `SELECT * FROM ${SOURCE_TABLE} LIMIT 100`;
/** 열 칩은 이만큼만 보여 준다 (아주 넓은 표) */
const COLUMN_CHIP_MAX = 40;

const chip = 'rounded-md px-2 py-1 text-xs transition';

/**
 * SQL 질의 창. DuckDB(WebAssembly)를 처음 열 때 내려받고, 표를 `t`로 잡아 질의한다.
 * 결과는 부모의 표 격자에 보여 주고, 결과를 새 표 문서(Parquet)로 저장할 수 있다.
 */
export function QueryPanel({ doc, blob, sourceColumns, onResult, onClose }: QueryPanelProps) {
  const navigate = useNavigate();
  const [engine, setEngine] = useState<EngineState>({ status: 'loading', progress: null });
  const [sql, setSql] = useState(DEFAULT_SQL);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [savedLink, setSavedLink] = useState<{ id: string; title: string } | null>(null);
  const [lastSql, setLastSql] = useState<string | null>(null);
  const sessionRef = useRef<QuerySession | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 저장해 둔 질의문 복원
  useEffect(() => {
    let cancelled = false;
    storage.settings
      .get<string>(settingsKey(doc.id))
      .then((saved) => {
        if (!cancelled && typeof saved === 'string' && saved.trim()) setSql(saved);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [doc.id]);

  // 엔진·세션 열기 (닫을 때 정리)
  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    let opened: QuerySession | null = null;
    setEngine({ status: 'loading', progress: null });
    (async () => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const session = await openQuerySession(bytes, (progress) => {
        if (!cancelled) setEngine({ status: 'loading', progress });
      });
      if (cancelled) {
        await session.close();
        return;
      }
      opened = session;
      sessionRef.current = session;
      setEngine({ status: 'ready' });
    })().catch((err: unknown) => {
      if (cancelled) return;
      setEngine({ status: 'error', message: err instanceof Error ? err.message : String(err) });
    });
    return () => {
      cancelled = true;
      sessionRef.current = null;
      void opened?.close();
    };
  }, [blob]);

  const run = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || running) return;
    const text = sql.trim();
    if (!text) return;
    setRunning(true);
    setError(null);
    setSavedLink(null);
    try {
      const result = await session.query(text);
      onResult(result);
      setLastSql(text);
      setStatus(
        `${result.rows.length.toLocaleString()}행 · ${result.elapsedMs}ms` +
          (result.truncated
            ? ` · 결과가 많아 처음 ${QUERY_MAX_ROWS.toLocaleString()}행만 보여 줍니다`
            : ''),
      );
      void storage.settings.set(settingsKey(doc.id), text);
    } catch (err) {
      setError(tidySqlError(err instanceof Error ? err.message : String(err)));
      setStatus(null);
    } finally {
      setRunning(false);
    }
  }, [doc.id, onResult, running, sql]);

  async function saveAsDocument() {
    const session = sessionRef.current;
    if (!session || !lastSql || saving) return;
    const title = window.prompt('새 표 문서 이름', `${doc.title} (질의)`);
    if (title === null) return;
    const name = title.trim() || `${doc.title} (질의)`;
    setSaving(true);
    setError(null);
    setSavedLink(null);
    try {
      const bytes = await session.exportParquet(lastSql);
      const file = new File([bytes.slice()], `${name}.parquet`, { type: PARQUET_MIME });
      const outcome = await importParquetFile(file, {
        storage,
        folderId: doc.folderId,
        inspect: inspectParquet,
      });
      if (outcome.status === 'done') {
        setStatus(`"${name}" 표 문서로 저장했습니다 (${formatBytes(file.size)})`);
        setSavedLink({ id: outcome.documentId, title: name });
      } else if (outcome.status === 'duplicate') {
        setStatus('같은 내용의 표 문서가 이미 있습니다');
        setSavedLink({ id: outcome.existingDocumentId, title: outcome.existingTitle });
      } else if (outcome.status === 'error') {
        setError(outcome.message);
      }
    } catch (err) {
      setError(tidySqlError(err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  }

  function insertAtCursor(text: string) {
    const area = textareaRef.current;
    if (!area) {
      setSql((current) => `${current}${text}`);
      return;
    }
    const start = area.selectionStart ?? sql.length;
    const end = area.selectionEnd ?? sql.length;
    const next = `${sql.slice(0, start)}${text}${sql.slice(end)}`;
    setSql(next);
    requestAnimationFrame(() => {
      area.focus();
      area.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      void run();
    }
  }

  const ready = engine.status === 'ready';
  const examples = exampleQueries(sourceColumns);

  return (
    <section
      className="border-b border-slate-200 bg-white px-3 py-2 sm:px-5"
      aria-label="SQL 질의"
      data-query-panel
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-slate-800">SQL 질의</span>
        <span className="text-xs text-slate-500">
          표는 <code className="rounded bg-slate-100 px-1">{SOURCE_TABLE}</code> 이름으로 씁니다.
          Ctrl+Enter로 실행
        </span>
        <span className="flex-1" />
        {engine.status === 'loading' && (
          <span className="text-xs text-slate-500" data-query-engine-status>
            SQL 엔진 준비 중… (처음 한 번 약 7MB)
            {engine.progress && engine.progress.bytesTotal > 0
              ? ` ${formatBytes(engine.progress.bytesLoaded)} / ${formatBytes(engine.progress.bytesTotal)}`
              : ''}
          </span>
        )}
        {engine.status === 'error' && (
          <span className="text-xs text-red-600" role="alert" data-query-engine-status>
            {engine.message}
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            onResult(null);
            onClose();
          }}
          className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
          data-query-close
        >
          닫기
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        onKeyDown={onKeyDown}
        rows={4}
        spellCheck={false}
        className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm leading-snug focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
        placeholder={DEFAULT_SQL}
        data-query-sql
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={!ready || running || sql.trim().length === 0}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
          data-query-run
        >
          {running ? '실행 중…' : '실행'}
        </button>
        <button
          type="button"
          onClick={() => void saveAsDocument()}
          disabled={!ready || !lastSql || saving || running}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          title="마지막으로 실행한 질의의 전체 결과를 Parquet 표 문서로 저장합니다"
          data-query-save
        >
          {saving ? '저장 중…' : '결과를 새 표 문서로 저장'}
        </button>
        <button
          type="button"
          onClick={() => {
            onResult(null);
            setStatus(null);
            setSavedLink(null);
          }}
          className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
          data-query-back
        >
          표로 돌아가기
        </button>
        {status && (
          <span className="text-xs text-slate-600" role="status" data-query-status>
            {status}
            {savedLink && (
              <>
                {' · '}
                <Link
                  to={`/d/${savedLink.id}`}
                  className="text-indigo-600 hover:underline"
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(`/d/${savedLink.id}`);
                  }}
                  data-query-saved-link
                >
                  "{savedLink.title}" 열기
                </Link>
              </>
            )}
          </span>
        )}
      </div>
      {error && (
        <pre
          className="mt-2 overflow-auto rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs whitespace-pre-wrap text-red-700"
          role="alert"
          data-query-error
        >
          {error}
        </pre>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="예시 질의">
        <span className="mr-1 text-xs text-slate-500">예시</span>
        {examples.map((example) => (
          <button
            key={example.label}
            type="button"
            onClick={() => setSql(example.sql)}
            className={`${chip} bg-slate-100 text-slate-700 hover:bg-slate-200`}
            data-query-example={example.label}
          >
            {example.label}
          </button>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1" aria-label="열 이름">
        <span className="mr-1 text-xs text-slate-500">열</span>
        {sourceColumns.slice(0, COLUMN_CHIP_MAX).map((column) => (
          <button
            key={column.name}
            type="button"
            onClick={() => insertAtCursor(quoteIdentifier(column.name))}
            className={`${chip} font-mono text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100`}
            title={`${column.type} · 눌러서 질의에 넣기`}
            data-query-column={column.name}
          >
            {column.name}
          </button>
        ))}
        {sourceColumns.length > COLUMN_CHIP_MAX && (
          <span className="text-xs text-slate-400">
            외 {sourceColumns.length - COLUMN_CHIP_MAX}개
          </span>
        )}
      </div>
    </section>
  );
}
