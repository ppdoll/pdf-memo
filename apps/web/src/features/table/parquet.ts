import type { SchemaElement, SchemaTree } from 'hyparquet';
import type { Row, TableColumn } from './model';

/**
 * hyparquet 래퍼. 메타데이터만 먼저 읽고(빠름), 행은 범위로 읽는다.
 * 압축 해제기(snappy·zstd·gzip·brotli·lz4)는 필요할 때 내려받는다.
 */

export interface ParquetTable {
  rowCount: number;
  columns: TableColumn[];
  rowGroups: number;
  createdBy: string | null;
  readRows(start: number, end: number): Promise<Row[]>;
}

/** 이보다 행이 많으면 전부 메모리에 올리지 않고 쪽마다 읽는다 (찾기·정렬 없음) */
export const FULL_LOAD_MAX_ROWS = 100_000;

type Hyparquet = typeof import('hyparquet');

let modules: Promise<{ hp: Hyparquet; compressors: import('hyparquet').Compressors }> | undefined;

function loadModules() {
  modules ??= Promise.all([import('hyparquet'), import('hyparquet-compressors')]).then(
    ([hp, { compressors }]) => ({ hp, compressors }),
  );
  return modules;
}

const PHYSICAL_LABEL: Record<string, string> = {
  BOOLEAN: '참/거짓',
  INT32: '정수',
  INT64: '정수',
  INT96: '날짜시간',
  FLOAT: '소수',
  DOUBLE: '소수',
  BYTE_ARRAY: '바이트',
  FIXED_LEN_BYTE_ARRAY: '바이트',
};

/** 스키마 요소를 사람이 읽는 형식 이름으로 */
export function describeType(
  element: SchemaElement,
  children: number,
): { type: string; numeric: boolean } {
  const logical = element.logical_type?.type;
  const converted = element.converted_type;
  if (logical === 'STRING' || converted === 'UTF8' || logical === 'ENUM' || converted === 'ENUM')
    return { type: '글', numeric: false };
  if (logical === 'DATE' || converted === 'DATE') return { type: '날짜', numeric: false };
  if (
    logical === 'TIMESTAMP' ||
    converted === 'TIMESTAMP_MILLIS' ||
    converted === 'TIMESTAMP_MICROS'
  )
    return { type: '날짜시간', numeric: false };
  if (logical === 'TIME' || converted === 'TIME_MILLIS' || converted === 'TIME_MICROS')
    return { type: '시각', numeric: false };
  if (logical === 'DECIMAL' || converted === 'DECIMAL') return { type: '소수', numeric: true };
  if (logical === 'JSON' || converted === 'JSON') return { type: 'JSON', numeric: false };
  if (logical === 'UUID') return { type: 'UUID', numeric: false };
  if (logical === 'LIST' || converted === 'LIST') return { type: '목록', numeric: false };
  if (logical === 'MAP' || converted === 'MAP') return { type: '맵', numeric: false };
  if (!element.type && children > 0) return { type: '구조', numeric: false };
  const physical = element.type ? (PHYSICAL_LABEL[element.type] ?? element.type) : '값';
  return { type: physical, numeric: physical === '정수' || physical === '소수' };
}

export function columnsFromSchema(tree: SchemaTree): TableColumn[] {
  return tree.children.map((child) => ({
    name: child.element.name,
    ...describeType(child.element, child.children.length),
  }));
}

/** 파일 전체 바이트에서 표를 연다. 행 읽기는 호출마다 필요한 row group만 푼다 */
export async function openParquet(buffer: ArrayBuffer): Promise<ParquetTable> {
  const { hp, compressors } = await loadModules();
  const metadata = hp.parquetMetadata(buffer);
  const tree = hp.parquetSchema(metadata);
  const rowCount = Number(metadata.num_rows);
  return {
    rowCount,
    columns: columnsFromSchema(tree),
    rowGroups: metadata.row_groups.length,
    createdBy: metadata.created_by ?? null,
    async readRows(start, end) {
      const rowStart = Math.max(0, start);
      const rowEnd = Math.min(rowCount, end);
      if (rowEnd <= rowStart) return [];
      return hp.parquetReadObjects({ file: buffer, metadata, compressors, rowStart, rowEnd });
    },
  };
}
