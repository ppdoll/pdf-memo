import * as duckdb from '@duckdb/duckdb-wasm';
import ehWorkerUrl from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import ehWasmUrl from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import { SOURCE_TABLE, copyToParquet, runPreview, type QueryResult } from './sql';

/**
 * DuckDB(WebAssembly) 엔진. 워커 하나를 앱이 사는 동안 재사용하고, 표 문서마다 세션을 연다.
 * wasm(약 34MB, 전송 시 브로틀리로 약 7MB)은 처음 질의할 때 한 번 내려받고 서비스 워커가 보관한다.
 * 예외 처리(EH) 번들만 싣는다. 2021년 이후 브라우저는 모두 지원한다.
 */

export interface EngineProgress {
  bytesLoaded: number;
  bytesTotal: number;
}

export const SQL_UNSUPPORTED_MESSAGE =
  '이 브라우저는 SQL 질의에 필요한 WebAssembly 기능(예외 처리)을 지원하지 않습니다';

let enginePromise: Promise<duckdb.AsyncDuckDB> | undefined;
let sessionCounter = 0;

export function loadDuckDb(
  onProgress?: (progress: EngineProgress) => void,
): Promise<duckdb.AsyncDuckDB> {
  enginePromise ??= (async () => {
    const features = await duckdb.getPlatformFeatures();
    if (!features.wasmExceptions) throw new Error(SQL_UNSUPPORTED_MESSAGE);
    const worker = new Worker(ehWorkerUrl);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    try {
      await db.instantiate(ehWasmUrl, null, (p) =>
        onProgress?.({ bytesLoaded: p.bytesLoaded, bytesTotal: p.bytesTotal }),
      );
      // 소수(DECIMAL)는 double로, TIMESTAMP는 Date64(밀리초)로 받아 표 모델이 다루기 쉽게 한다
      await db.open({ query: { castDecimalToDouble: true, castTimestampToDate: true } });
    } catch (error) {
      worker.terminate();
      throw error;
    }
    return db;
  })();
  enginePromise.catch(() => {
    enginePromise = undefined;
  });
  return enginePromise;
}

export interface QuerySession {
  /** 미리보기 질의 (QUERY_MAX_ROWS 행까지) */
  query(sql: string): Promise<QueryResult>;
  /** 질의 결과를 Parquet 바이트로 */
  exportParquet(sql: string): Promise<Uint8Array>;
  close(): Promise<void>;
}

/**
 * Parquet 바이트를 가상 파일로 등록하고 `t` 뷰로 연다.
 * 뷰는 카탈로그 전체에 하나뿐이라 질의할 때마다 이 세션의 파일을 가리키도록 다시 만들고,
 * 닫을 때는 지우지 않는다. 세션이 겹쳐 열려도(React 개발 모드의 이중 마운트) 경쟁이 없다.
 */
export async function openQuerySession(
  bytes: Uint8Array,
  onProgress?: (progress: EngineProgress) => void,
): Promise<QuerySession> {
  const db = await loadDuckDb(onProgress);
  const id = (sessionCounter += 1);
  const sourceFile = `source-${id}.parquet`;
  await db.registerFileBuffer(sourceFile, bytes);
  const conn = await db.connect();
  const exec = (sql: string) => conn.query(sql);
  let closed = false;

  async function pointViewHere() {
    if (closed) throw new Error('질의 세션이 닫혔습니다. 표를 다시 열어 주세요');
    await conn.query(
      `CREATE OR REPLACE VIEW ${SOURCE_TABLE} AS SELECT * FROM read_parquet('${sourceFile}')`,
    );
  }

  await pointViewHere();

  return {
    async query(sql) {
      await pointViewHere();
      return runPreview(exec, sql);
    },
    async exportParquet(sql) {
      await pointViewHere();
      const outFile = `result-${id}-${Date.now()}.parquet`;
      // 결과는 가상 파일(메모리)에 쓴다. 등록해 두지 않으면 Node 런타임은 실제 디스크에 쓴다
      await db.registerEmptyFileBuffer(outFile);
      await conn.query(copyToParquet(sql, outFile));
      try {
        return await db.copyFileToBuffer(outFile);
      } finally {
        await db.dropFile(outFile).catch(() => undefined);
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      await conn.close().catch(() => undefined);
      await db.dropFile(sourceFile).catch(() => undefined);
    },
  };
}
