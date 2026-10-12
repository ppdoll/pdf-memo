import { ROOT_FOLDER_ID, type PdfDocument } from '@pdf-memo/shared';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { formatBytes } from '../../lib/quota';
import { downloadFile } from '../export/download';
import { sanitizeFileName } from '../export/exportService';
import { PARQUET_MIME } from '../import/parquet/detect';
import {
  ROWS_PER_PAGE,
  clipCell,
  filterRows,
  formatCell,
  nextSort,
  pageCount,
  sortRows,
  toCsv,
  type Row,
  type SortSpec,
  type TableColumn,
} from './model';
import { FULL_LOAD_MAX_ROWS, openParquet, type ParquetTable } from './parquet';

type LoadState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; table: ParquetTable; all: Row[] | null; indexOf: WeakMap<Row, number> }
  | { status: 'error'; message: string };

/** CSV로 저장할 때 한 번에 읽는 행 수 (쪽 단위 모드) */
const CSV_CHUNK = 20_000;
/** 이보다 행이 많으면 브라우저 메모리를 생각해 CSV 저장을 막는다 */
const CSV_MAX_ROWS = 500_000;

interface TableDocumentPageProps {
  doc: PdfDocument;
  blob: Blob | null;
}

/**
 * 표 문서(Parquet) 뷰어. 행이 FULL_LOAD_MAX_ROWS 이하면 전부 읽어 찾기·정렬을 제공하고,
 * 더 많으면 쪽마다 필요한 행 범위만 읽는다. 원본(.parquet)과 CSV로 저장할 수 있다.
 */
export function TableDocumentPage({ doc, blob }: TableDocumentPageProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading', message: '표를 여는 중…' });
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<SortSpec | null>(null);
  const [pageRows, setPageRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    setState({ status: 'loading', message: '표를 여는 중…' });
    setPage(0);
    setSort(null);
    (async () => {
      const table = await openParquet(await blob.arrayBuffer());
      if (cancelled) return;
      if (table.rowCount > FULL_LOAD_MAX_ROWS) {
        setState({ status: 'ready', table, all: null, indexOf: new WeakMap() });
        return;
      }
      setState({
        status: 'loading',
        message: `행 ${table.rowCount.toLocaleString()}개를 읽는 중…`,
      });
      const all = await table.readRows(0, table.rowCount);
      if (cancelled) return;
      setState({
        status: 'ready',
        table,
        all,
        indexOf: new WeakMap(all.map((row, i) => [row, i])),
      });
    })().catch((error: unknown) => {
      if (cancelled) return;
      const message = error instanceof Error ? error.message : String(error);
      setState({ status: 'error', message: `Parquet 파일을 읽을 수 없습니다: ${message}` });
    });
    return () => {
      cancelled = true;
    };
  }, [blob]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query), 200);
    return () => window.clearTimeout(timer);
  }, [query]);

  // 찾기·정렬이 바뀌면 첫 쪽으로
  useEffect(() => setPage(0), [debounced, sort]);

  const ready = state.status === 'ready' ? state : null;
  const columns: TableColumn[] = ready?.table.columns ?? [];
  const pageMode = ready !== null && ready.all === null;

  const view = useMemo(() => {
    if (!ready || !ready.all) return [];
    return sortRows(filterRows(ready.all, ready.table.columns, debounced), sort);
  }, [ready, debounced, sort]);

  const total = pageMode ? (ready?.table.rowCount ?? 0) : view.length;
  const pages = pageCount(total);
  const safePage = Math.min(page, pages - 1);
  const rows = pageMode
    ? pageRows
    : view.slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE);

  // 쪽 단위 모드: 쪽이 바뀔 때 그 범위만 읽는다
  useEffect(() => {
    if (!ready || !pageMode) return;
    let cancelled = false;
    ready.table
      .readRows(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE)
      .then((loaded) => {
        if (!cancelled) setPageRows(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled) setNotice(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [ready, pageMode, safePage]);

  function rowNumber(row: Row, i: number): number {
    if (pageMode) return safePage * ROWS_PER_PAGE + i + 1;
    return (ready?.indexOf.get(row) ?? i) + 1;
  }

  function saveOriginal() {
    if (!blob) return;
    downloadFile(
      new File([blob], `${sanitizeFileName(doc.title)}.parquet`, { type: PARQUET_MIME }),
    );
  }

  async function saveCsv() {
    if (!ready) return;
    setNotice(null);
    const bom = String.fromCharCode(0xfeff);
    const name = `${sanitizeFileName(doc.title)}.csv`;
    try {
      if (!pageMode) {
        downloadFile(new File([bom, toCsv(columns, view)], name, { type: 'text/csv' }));
        setNotice(`${view.length.toLocaleString()}행을 CSV로 저장했습니다`);
        return;
      }
      if (ready.table.rowCount > CSV_MAX_ROWS) {
        setNotice(
          `행이 너무 많아(${ready.table.rowCount.toLocaleString()}) CSV로 저장할 수 없습니다`,
        );
        return;
      }
      const header = toCsv(columns, []);
      const parts: string[] = [bom, header];
      for (let start = 0; start < ready.table.rowCount; start += CSV_CHUNK) {
        setBusy(
          `CSV 만드는 중… ${Math.min(start + CSV_CHUNK, ready.table.rowCount).toLocaleString()}/${ready.table.rowCount.toLocaleString()}`,
        );
        const chunk = await ready.table.readRows(start, start + CSV_CHUNK);
        parts.push(toCsv(columns, chunk).slice(header.length));
      }
      downloadFile(new File(parts, name, { type: 'text/csv' }));
      setNotice(`${ready.table.rowCount.toLocaleString()}행을 CSV로 저장했습니다`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const backHref = doc.folderId === ROOT_FOLDER_ID ? '/' : `/f/${doc.folderId}`;
  const chip = 'rounded-md px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-100';
  const summary = ready
    ? `${ready.table.rowCount.toLocaleString()}행 × ${columns.length}열`
    : doc.table
      ? `${doc.table.rows.toLocaleString()}행 × ${doc.table.columns}열`
      : null;
  const firstRow = total === 0 ? 0 : safePage * ROWS_PER_PAGE + 1;
  const lastRow = Math.min(total, (safePage + 1) * ROWS_PER_PAGE);

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
          <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
            표
          </span>
          <span className="ml-2 text-xs font-normal text-slate-500" data-table-summary>
            {summary ? `${summary} · ` : ''}
            {formatBytes(doc.byteSize)}
          </span>
        </h1>
        <label className="flex items-center gap-1 text-sm">
          <span className="sr-only">찾기</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={pageMode ? '행이 많아 찾기 없음' : '셀 찾기'}
            disabled={pageMode || !ready}
            title={
              pageMode
                ? `행이 ${FULL_LOAD_MAX_ROWS.toLocaleString()}개를 넘으면 찾기·정렬을 끕니다`
                : undefined
            }
            className="w-40 rounded-md border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
            data-table-find
          />
          {!pageMode && debounced.trim() && (
            <span className="text-xs text-slate-500" aria-live="polite" data-table-find-count>
              {view.length.toLocaleString()}행
            </span>
          )}
        </label>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void saveCsv()}
            disabled={!ready || busy !== null}
            className={`${chip} disabled:opacity-50`}
            title="찾기·정렬이 적용된 표를 CSV(엑셀)로 저장합니다"
            data-table-csv
          >
            {busy ?? 'CSV 저장'}
          </button>
          <button type="button" onClick={saveOriginal} disabled={!blob} className={chip}>
            원본 저장
          </button>
        </div>
      </header>
      {notice && (
        <p
          className="border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-700"
          role="status"
          data-table-notice
        >
          {notice}
        </p>
      )}
      <main className="min-h-0 flex-1 overflow-auto px-3 py-3 sm:px-5">
        {state.status === 'loading' && <p className="text-sm text-slate-500">{state.message}</p>}
        {state.status === 'error' && (
          <p className="text-sm text-red-600" role="alert">
            {state.message}
          </p>
        )}
        {ready && (
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5 text-xs text-slate-600">
              <span data-table-range>
                {total === 0
                  ? '행이 없습니다'
                  : `${firstRow.toLocaleString()}–${lastRow.toLocaleString()} / ${total.toLocaleString()}행`}
                {pageMode && ' · 행이 많아 쪽마다 읽습니다 (찾기·정렬 없음)'}
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  className="rounded-md border border-slate-300 px-2 py-0.5 disabled:opacity-40"
                  aria-label="이전 쪽"
                  data-table-prev
                >
                  ‹
                </button>
                <span data-table-page>
                  {safePage + 1} / {pages}쪽
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pages - 1, safePage + 1))}
                  disabled={safePage >= pages - 1}
                  className="rounded-md border border-slate-300 px-2 py-0.5 disabled:opacity-40"
                  aria-label="다음 쪽"
                  data-table-next
                >
                  ›
                </button>
              </span>
            </div>
            <div className="overflow-auto">
              <table className="min-w-full border-collapse text-sm" data-table-grid>
                <thead className="sticky top-0 z-10 bg-slate-50 text-xs text-slate-600">
                  <tr>
                    <th className="border-b border-slate-200 px-2 py-1.5 text-right font-medium">
                      #
                    </th>
                    {columns.map((column) => {
                      const active = sort?.column === column.name ? sort.direction : null;
                      return (
                        <th
                          key={column.name}
                          scope="col"
                          className={`border-b border-slate-200 px-2 py-1.5 font-medium whitespace-nowrap ${
                            column.numeric ? 'text-right' : 'text-left'
                          }`}
                          aria-sort={
                            active ? (active === 'asc' ? 'ascending' : 'descending') : 'none'
                          }
                        >
                          <button
                            type="button"
                            onClick={() => setSort((current) => nextSort(current, column.name))}
                            disabled={pageMode}
                            className="inline-flex max-w-xs flex-col items-start gap-0 rounded px-1 text-left hover:bg-slate-100 disabled:cursor-default disabled:hover:bg-transparent"
                            title={pageMode ? undefined : '눌러서 정렬'}
                            data-table-sort={column.name}
                          >
                            <span className="truncate font-semibold text-slate-800">
                              {column.name}
                              {active && (
                                <span className="ml-1 text-indigo-600" aria-hidden>
                                  {active === 'asc' ? '▲' : '▼'}
                                </span>
                              )}
                            </span>
                            <span className="text-[10px] font-normal text-slate-400">
                              {column.type}
                            </span>
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={rowNumber(row, i)}
                      className="odd:bg-white even:bg-slate-50/60 hover:bg-indigo-50/40"
                    >
                      <td className="px-2 py-1 text-right font-mono text-xs text-slate-400 tabular-nums">
                        {rowNumber(row, i).toLocaleString()}
                      </td>
                      {columns.map((column) => {
                        const text = formatCell(row[column.name]);
                        return (
                          <td
                            key={column.name}
                            className={`max-w-md truncate px-2 py-1 whitespace-nowrap ${
                              column.numeric ? 'text-right font-mono tabular-nums' : 'text-left'
                            } ${text === null ? 'text-slate-300' : 'text-slate-800'}`}
                            title={text ?? undefined}
                          >
                            {text === null ? '—' : clipCell(text)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
