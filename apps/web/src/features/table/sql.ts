import type { Table as ArrowTable } from 'apache-arrow';
import { DataType, DateUnit } from 'apache-arrow';
import type { Row, TableColumn } from './model';

/**
 * SQL 질의의 순수 부분: 문장 손질, 미리보기 LIMIT 감싸기, Arrow 결과 → 표 모델.
 * DuckDB 자체는 duckdb.ts가 다루므로 여기는 Node 테스트가 쉽다.
 */

/** 결과 표로 보여 주는 최대 행 수. 그보다 많으면 잘라 내고 알린다 */
export const QUERY_MAX_ROWS = 100_000;

/** 원본 표를 가리키는 이름. 질의 안에서 `t`로 쓴다 */
export const SOURCE_TABLE = 't';

/** 끝의 세미콜론·공백·한 줄 주석을 뗀다 (서브쿼리로 감쌀 수 있게) */
export function stripTrailing(sql: string): string {
  let text = sql.trim();
  for (;;) {
    const next = text.replace(/(--[^\n]*)?\s*$/, '').replace(/;+\s*$/, '');
    if (next === text) return text;
    text = next.trim();
  }
}

/** 사용자 문장을 서브쿼리로 감싸 행 수를 제한한다 (DuckDB는 CTE·ORDER BY도 서브쿼리 안에서 허용) */
export function wrapPreview(sql: string, limit = QUERY_MAX_ROWS): string {
  return `SELECT * FROM (${stripTrailing(sql)}) AS q LIMIT ${limit + 1}`;
}

/** 질의 결과를 Parquet 파일로 쓰는 COPY 문 */
export function copyToParquet(sql: string, fileName: string): string {
  return `COPY (${stripTrailing(sql)}) TO '${fileName}' (FORMAT PARQUET, COMPRESSION ZSTD)`;
}

/** 열 이름을 SQL 식별자로. 예약어(at, day …)와 공백·한글 이름도 안전하다 */
export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

export interface QueryResult {
  columns: TableColumn[];
  rows: Row[];
  /** QUERY_MAX_ROWS를 넘어 잘라 냈으면 true */
  truncated: boolean;
  elapsedMs: number;
}

/** 사전(dictionary) 인코딩이면 실제 값의 형식으로 푼다 */
function valueType(type: DataType): DataType {
  return DataType.isDictionary(type) ? valueType(type.dictionary) : type;
}

/** Arrow 형식을 사람이 읽는 이름으로 (parquet.ts의 describeType과 같은 어휘) */
export function describeArrowType(raw: DataType): { type: string; numeric: boolean } {
  const type = valueType(raw);
  if (DataType.isInt(type)) return { type: '정수', numeric: true };
  if (DataType.isFloat(type) || DataType.isDecimal(type)) return { type: '소수', numeric: true };
  if (DataType.isUtf8(type) || DataType.isLargeUtf8(type)) return { type: '글', numeric: false };
  if (DataType.isBool(type)) return { type: '참/거짓', numeric: false };
  if (DataType.isDate(type)) {
    // DuckDB-WASM은 TIMESTAMP를 Date64(밀리초)로 바꿔 준다. DATE는 Date32(일)
    return { type: type.unit === DateUnit.DAY ? '날짜' : '날짜시간', numeric: false };
  }
  if (DataType.isTimestamp(type)) return { type: '날짜시간', numeric: false };
  if (DataType.isTime(type)) return { type: '시각', numeric: false };
  if (DataType.isList(type) || DataType.isFixedSizeList(type))
    return { type: '목록', numeric: false };
  if (DataType.isStruct(type)) return { type: '구조', numeric: false };
  if (DataType.isMap(type)) return { type: '맵', numeric: false };
  if (DataType.isBinary(type) || DataType.isLargeBinary(type) || DataType.isFixedSizeBinary(type))
    return { type: '바이트', numeric: false };
  if (DataType.isNull(type)) return { type: '빈값', numeric: false };
  return { type: String(type), numeric: false };
}

export function columnsFromArrow(table: ArrowTable): TableColumn[] {
  return table.schema.fields.map((field) => ({
    name: field.name,
    ...describeArrowType(field.type),
  }));
}

/**
 * Arrow 행을 표 모델 행으로. 날짜·날짜시간은 Arrow가 밀리초 숫자로 주므로 Date로 바꾸고,
 * 목록·구조 같은 중첩 값은 그대로 둔다(formatCell이 toJSON으로 찍는다).
 */
export function rowsFromArrow(table: ArrowTable, limit = QUERY_MAX_ROWS): Row[] {
  const fields = table.schema.fields;
  const dateColumns = fields
    .filter((f) => {
      const type = valueType(f.type);
      return DataType.isDate(type) || DataType.isTimestamp(type);
    })
    .map((f) => f.name);
  const rows: Row[] = [];
  for (const struct of table.toArray()) {
    if (rows.length >= limit) break;
    const row = struct.toJSON() as Row;
    for (const name of dateColumns) {
      const value = row[name];
      if (typeof value === 'number') row[name] = new Date(value);
      else if (typeof value === 'bigint') row[name] = new Date(Number(value));
    }
    rows.push(row);
  }
  return rows;
}

/** 열 목록으로 만드는 예시 질의. 처음 쓰는 사람이 고쳐 쓰기 좋게 짧게 */
export function exampleQueries(
  columns: readonly TableColumn[],
): Array<{ label: string; sql: string }> {
  const first = columns[0] ? quoteIdentifier(columns[0].name) : '*';
  const text = columns.find((c) => c.type === '글');
  const numeric = columns.find((c) => c.numeric);
  const examples = [
    { label: '앞 100행', sql: `SELECT * FROM ${SOURCE_TABLE} LIMIT 100` },
    { label: '행 수', sql: `SELECT count(*) AS 행수 FROM ${SOURCE_TABLE}` },
  ];
  if (text) {
    const col = quoteIdentifier(text.name);
    examples.push({
      label: `${text.name}별 개수`,
      sql: `SELECT ${col}, count(*) AS 개수\nFROM ${SOURCE_TABLE}\nGROUP BY ${col}\nORDER BY 개수 DESC`,
    });
    examples.push({
      label: '글 조건',
      sql: `SELECT * FROM ${SOURCE_TABLE}\nWHERE ${col} LIKE '%검색어%'\nLIMIT 100`,
    });
  }
  if (numeric) {
    const col = quoteIdentifier(numeric.name);
    examples.push({
      label: `${numeric.name} 통계`,
      sql: `SELECT min(${col}) AS 최소, max(${col}) AS 최대, avg(${col}) AS 평균, sum(${col}) AS 합계\nFROM ${SOURCE_TABLE}`,
    });
  }
  if (!text && !numeric) {
    examples.push({
      label: '정렬',
      sql: `SELECT * FROM ${SOURCE_TABLE} ORDER BY ${first} LIMIT 100`,
    });
  }
  return examples;
}

export type SqlExecutor = (sql: string) => Promise<ArrowTable>;

/**
 * 미리보기 질의 실행. 먼저 LIMIT을 감싸서 돌리고, 감쌀 수 없는 문장(SHOW·PRAGMA 등)이나
 * 문법 오류면 원문 그대로 다시 돌려 원래 오류 메시지가 나오게 한다.
 */
export async function runPreview(exec: SqlExecutor, sql: string): Promise<QueryResult> {
  const started = performance.now();
  let table: ArrowTable;
  try {
    table = await exec(wrapPreview(sql));
  } catch {
    table = await exec(stripTrailing(sql));
  }
  const rows = rowsFromArrow(table);
  return {
    columns: columnsFromArrow(table),
    rows,
    truncated: table.numRows > QUERY_MAX_ROWS,
    elapsedMs: Math.round(performance.now() - started),
  };
}

/** DuckDB 오류 메시지에서 "LINE n: … ^" 안내 중복을 정리한다 */
export function tidySqlError(message: string): string {
  const lines = message.split('\n');
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const line of lines) {
    const key = line.trim();
    if (key === '') continue;
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(line);
  }
  return kept.join('\n');
}
