import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { tableFromArrays } from 'apache-arrow';
import type { Table as ArrowTable } from 'apache-arrow';
import { parquetWriteBuffer } from 'hyparquet-writer';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { formatCell } from '../model';
import { openParquet } from '../parquet';
import {
  QUERY_MAX_ROWS,
  columnsFromArrow,
  copyToParquet,
  exampleQueries,
  quoteIdentifier,
  rowsFromArrow,
  runPreview,
  stripTrailing,
  tidySqlError,
  wrapPreview,
} from '../sql';

describe('statement helpers', () => {
  it('strips trailing semicolons, whitespace and line comments before wrapping', () => {
    expect(stripTrailing('SELECT 1;  ')).toBe('SELECT 1');
    expect(stripTrailing('SELECT 1; -- 끝\n')).toBe('SELECT 1');
    expect(stripTrailing('SELECT 1;;\n-- a\n-- b')).toBe('SELECT 1');
    expect(stripTrailing('SELECT -- 안의 주석\n 1')).toBe('SELECT -- 안의 주석\n 1');
    expect(wrapPreview('SELECT * FROM t;', 10)).toBe(
      'SELECT * FROM (SELECT * FROM t) AS q LIMIT 11',
    );
    expect(copyToParquet('SELECT 1;', 'out.parquet')).toBe(
      "COPY (SELECT 1) TO 'out.parquet' (FORMAT PARQUET, COMPRESSION ZSTD)",
    );
  });

  it('quotes identifiers so reserved words and odd names work', () => {
    expect(quoteIdentifier('at')).toBe('"at"');
    expect(quoteIdentifier('이름 열')).toBe('"이름 열"');
    expect(quoteIdentifier('say "hi"')).toBe('"say ""hi"""');
  });

  it('dedupes the repeated LINE/caret block DuckDB appends to parser errors', () => {
    const raw =
      'Parser Error: syntax error at or near "SELEC"\n\nLINE 1: SELEC 1\n        ^\n\nLINE 1: SELEC 1\n        ^';
    expect(tidySqlError(raw)).toBe(
      'Parser Error: syntax error at or near "SELEC"\nLINE 1: SELEC 1\n        ^',
    );
  });

  it('builds example queries from the columns', () => {
    const examples = exampleQueries([
      { name: 'at', type: '날짜시간', numeric: false },
      { name: 'city', type: '글', numeric: false },
      { name: 'amount', type: '소수', numeric: true },
    ]);
    expect(examples.map((e) => e.label)).toEqual([
      '앞 100행',
      '행 수',
      'city별 개수',
      '글 조건',
      'amount 통계',
    ]);
    expect(examples[2].sql).toContain('GROUP BY "city"');
    expect(examples[4].sql).toContain('avg("amount")');
  });
});

describe('arrow conversion', () => {
  const table = tableFromArrays({
    n: Float64Array.from([1.5, 2.5]),
    big: BigInt64Array.from([1n, 1099511627776n]),
    name: ['가', null],
    ok: [true, false],
    when: [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T10:30:00Z')],
  });

  it('labels columns by Arrow type and converts date columns to Date objects', () => {
    expect(columnsFromArrow(table)).toEqual([
      { name: 'n', type: '소수', numeric: true },
      { name: 'big', type: '정수', numeric: true },
      { name: 'name', type: '글', numeric: false },
      { name: 'ok', type: '참/거짓', numeric: false },
      { name: 'when', type: '날짜시간', numeric: false },
    ]);
    const rows = rowsFromArrow(table);
    expect(rows).toHaveLength(2);
    expect(rows[0].n).toBe(1.5);
    expect(rows[1].big).toBe(1099511627776n);
    expect(rows[1].name).toBeNull();
    expect(rows[0].when).toBeInstanceOf(Date);
    expect(formatCell(rows[1].when)).toBe('2026-01-02T10:30:00Z');
    expect(rowsFromArrow(table, 1)).toHaveLength(1);
  });
});

/** 실제 DuckDB(Node 블로킹 빌드)로 미리보기·내보내기 논리를 검증한다 */
describe('runPreview and COPY with the real engine', () => {
  const require = createRequire(import.meta.url);
  type Blocking = {
    createDuckDB: (
      bundles: unknown,
      logger: unknown,
      runtime: unknown,
    ) => Promise<{
      instantiate(onProgress: () => void): Promise<unknown>;
      open(config: unknown): void;
      connect(): { query(sql: string): ArrowTable; close(): void };
      registerFileBuffer(name: string, buffer: Uint8Array): void;
      copyFileToBuffer(name: string): Uint8Array;
      dropFile(name: string): void;
    }>;
    VoidLogger: new () => unknown;
    NODE_RUNTIME: unknown;
  };
  let conn: { query(sql: string): ArrowTable; close(): void };
  let db: Awaited<ReturnType<Blocking['createDuckDB']>>;

  beforeAll(async () => {
    const blocking = require('@duckdb/duckdb-wasm/dist/duckdb-node-blocking.cjs') as Blocking;
    const dist = path.dirname(require.resolve('@duckdb/duckdb-wasm'));
    const bundles = {
      mvp: {
        mainModule: path.join(dist, 'duckdb-mvp.wasm'),
        mainWorker: path.join(dist, 'duckdb-node-mvp.worker.cjs'),
      },
      eh: {
        mainModule: path.join(dist, 'duckdb-eh.wasm'),
        mainWorker: path.join(dist, 'duckdb-node-eh.worker.cjs'),
      },
    };
    db = await blocking.createDuckDB(bundles, new blocking.VoidLogger(), blocking.NODE_RUNTIME);
    await db.instantiate(() => undefined);
    db.open({ query: { castDecimalToDouble: true, castTimestampToDate: true } });
    const source = parquetWriteBuffer({
      columnData: [
        { name: 'id', data: [1, 2, 3, 4], type: 'INT32' },
        { name: 'city', data: ['서울', '부산', '서울', null], type: 'STRING', nullable: true },
        { name: 'amount', data: [10.5, 20, 30, 40], type: 'DOUBLE' },
        {
          name: 'at',
          data: [new Date('2026-01-01T00:00:00Z'), new Date('2026-01-02T00:00:00Z'), null, null],
          type: 'TIMESTAMP',
          nullable: true,
        },
      ],
    });
    db.registerFileBuffer('source.parquet', new Uint8Array(source));
    conn = db.connect();
    conn.query("CREATE VIEW t AS SELECT * FROM read_parquet('source.parquet')");
  }, 60_000);

  afterAll(() => {
    conn?.close();
  });

  const exec = async (sql: string) => conn.query(sql);

  it('runs aggregates, caps the preview and reports elapsed time', async () => {
    const grouped = await runPreview(
      exec,
      'SELECT city, count(*) AS n, sum(amount) AS total FROM t GROUP BY city ORDER BY total DESC;',
    );
    expect(grouped.columns.map((c) => c.name)).toEqual(['city', 'n', 'total']);
    expect(grouped.rows.map((r) => [r.city, formatCell(r.n), r.total])).toEqual([
      ['서울', '2', 40.5],
      [null, '1', 40],
      ['부산', '1', 20],
    ]);
    expect(grouped.truncated).toBe(false);
    expect(grouped.elapsedMs).toBeGreaterThanOrEqual(0);

    const capped = await runPreview(exec, `SELECT * FROM range(${QUERY_MAX_ROWS + 5}) AS r(i)`);
    expect(capped.rows).toHaveLength(QUERY_MAX_ROWS);
    expect(capped.truncated).toBe(true);
  });

  it('falls back to the raw statement for unwrappable statements and surfaces errors', async () => {
    const version = await runPreview(exec, 'PRAGMA version');
    expect(version.rows).toHaveLength(1);
    await expect(runPreview(exec, 'SELEC nope')).rejects.toThrow(/syntax error/);
    await expect(runPreview(exec, 'SELECT max(at) FROM t')).rejects.toThrow();
    const quoted = await runPreview(exec, 'SELECT max("at") AS last FROM t');
    expect(formatCell(quoted.rows[0].last)).toBe('2026-01-02');
  });

  it('writes query results as a Parquet file hyparquet can open', async () => {
    // Node 런타임은 경로를 실제 디스크로 보내므로 임시 폴더에 쓰고 지운다 (브라우저는 메모리 파일)
    const outFile = path.join(os.tmpdir(), `allread-sql-${process.pid}-${Date.now()}.parquet`);
    try {
      conn.query(
        copyToParquet(
          'SELECT city, sum(amount) AS total FROM t GROUP BY city ORDER BY city',
          outFile.replace(/\\/g, '/'),
        ),
      );
      const bytes = fs.readFileSync(outFile);
      const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const table = await openParquet(copy as ArrayBuffer);
      expect(table.rowCount).toBe(3);
      expect(table.columns.map((c) => c.name)).toEqual(['city', 'total']);
      const rows = await table.readRows(0, 3);
      // DuckDB는 ORDER BY에서 빈 값을 뒤에 둔다 (NULLS LAST)
      expect(rows.map((r) => [r.city, r.total])).toEqual([
        ['부산', 20],
        ['서울', 40.5],
        [null, 40],
      ]);
    } finally {
      fs.rmSync(outFile, { force: true });
    }
  });
});
