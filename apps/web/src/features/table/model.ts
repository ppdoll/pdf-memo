/**
 * 표 문서(Parquet)의 순수 모델: 열 정보, 셀 표시, 찾기·정렬, CSV 변환.
 * 디코더(hyparquet)에 기대지 않아 Node 테스트가 쉽다.
 */

export type CellValue = unknown;
export type Row = Record<string, CellValue>;

export interface TableColumn {
  name: string;
  /** 사람이 읽는 형식 이름 (정수, 소수, 글, 날짜, …) */
  type: string;
  /** 숫자처럼 오른쪽 정렬할지 */
  numeric: boolean;
}

export const CELL_MAX_CHARS = 200;

/** 셀 값을 화면·CSV용 문자열로. null·undefined는 null */
export function formatCell(value: CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : String(value);
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '잘못된 날짜';
    const iso = value.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.replace('.000Z', 'Z');
  }
  if (value instanceof Uint8Array) return `<${value.length} bytes>`;
  try {
    return JSON.stringify(value, (_key, inner: unknown) =>
      typeof inner === 'bigint'
        ? inner.toString()
        : inner instanceof Date
          ? inner.toISOString()
          : inner,
    );
  } catch {
    return String(value);
  }
}

/** 화면에 보여 줄 때 긴 값은 자른다 */
export function clipCell(text: string, max = CELL_MAX_CHARS): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** 찾기: 어떤 셀이든 (대소문자 무시) 포함하면 행을 남긴다. 빈 질의는 전부 */
export function filterRows(
  rows: readonly Row[],
  columns: readonly TableColumn[],
  query: string,
): Row[] {
  const needle = query.trim().toLocaleLowerCase();
  if (needle.length === 0) return [...rows];
  return rows.filter((row) =>
    columns.some((column) => {
      const text = formatCell(row[column.name]);
      return text !== null && text.toLocaleLowerCase().includes(needle);
    }),
  );
}

export type SortDirection = 'asc' | 'desc';

export interface SortSpec {
  column: string;
  direction: SortDirection;
}

function compareValues(a: CellValue, b: CellValue): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return 1; // 빈 값은 항상 뒤로
  if (bNull) return -1;
  if (
    (typeof a === 'number' || typeof a === 'bigint') &&
    (typeof b === 'number' || typeof b === 'bigint')
  ) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(formatCell(a)).localeCompare(String(formatCell(b)), 'ko');
}

/** 안정 정렬. 빈 값은 방향과 상관없이 맨 뒤 */
export function sortRows(rows: readonly Row[], sort: SortSpec | null): Row[] {
  const copy = [...rows];
  if (!sort) return copy;
  const sign = sort.direction === 'asc' ? 1 : -1;
  return copy.sort((x, y) => {
    const a = x[sort.column];
    const b = y[sort.column];
    const aNull = a === null || a === undefined;
    const bNull = b === null || b === undefined;
    if (aNull || bNull) return compareValues(a, b);
    return compareValues(a, b) * sign;
  });
}

/** 헤더 클릭: 없음 → 오름 → 내림 → 없음 */
export function nextSort(current: SortSpec | null, column: string): SortSpec | null {
  if (!current || current.column !== column) return { column, direction: 'asc' };
  if (current.direction === 'asc') return { column, direction: 'desc' };
  return null;
}

function csvEscape(text: string | null): string {
  if (text === null) return '';
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC 4180 CSV. 엑셀이 한글을 제대로 열도록 호출 측에서 BOM을 붙인다 */
export function toCsv(columns: readonly TableColumn[], rows: readonly Row[]): string {
  const lines = [columns.map((c) => csvEscape(c.name)).join(',')];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(formatCell(row[c.name]))).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export const ROWS_PER_PAGE = 200;

export function pageCount(total: number, perPage = ROWS_PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}
