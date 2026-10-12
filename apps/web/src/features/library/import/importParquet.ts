import { createPdfDocument } from '@pdf-memo/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { sha256Hex } from '../../../lib/hash';
import { formatBytes } from '../../../lib/quota';
import type { Storage } from '../../../storage/ports';
import {
  MAX_PARQUET_BYTES,
  PARQUET_MIME,
  hasParquetMagic,
  isParquetFile,
  titleFromParquetFileName,
} from '../../import/parquet/detect';
import { openParquet } from '../../table/parquet';
import { JSON_PAGE_SIZE } from './importJson';
import type { ImportOutcome, ImportStage } from './importPdf';

export interface ParquetSummary {
  rows: number;
  columns: number;
}

/** 메타데이터만 읽어 행·열 수를 얻는다. 테스트에서는 가짜를 준다 */
export type ParquetInspector = (buffer: ArrayBuffer) => Promise<ParquetSummary>;

export interface ImportParquetOptions {
  storage: Storage;
  folderId: string;
  inspect: ParquetInspector;
  onStage?: (stage: ImportStage) => void;
  maxBytes?: number;
}

/**
 * Parquet 파일을 라이브러리에 넣는다. 매직 바이트와 메타데이터(행·열 수)를 확인하고,
 * 바이트는 PDF와 같은 내용 해시 저장소에 그대로 두며, 문서는 kind 'table'로 저장해 표 뷰어로 연다.
 */
export async function importParquetFile(
  file: File,
  options: ImportParquetOptions,
): Promise<ImportOutcome> {
  const { storage, folderId, inspect, onStage, maxBytes = MAX_PARQUET_BYTES } = options;
  if (!isParquetFile(file)) return { status: 'error', message: 'Parquet 파일이 아닙니다' };
  if (file.size === 0) return { status: 'error', message: '빈 파일입니다' };
  if (file.size > maxBytes) {
    return { status: 'error', message: `파일이 너무 큽니다 (최대 ${formatBytes(maxBytes)})` };
  }

  onStage?.('analyzing');
  const buffer = await file.arrayBuffer();
  if (!hasParquetMagic(new Uint8Array(buffer))) {
    return { status: 'error', message: 'Parquet 파일이 아닙니다 (PAR1 표식이 없습니다)' };
  }
  let summary: ParquetSummary;
  try {
    summary = await inspect(buffer);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: 'error', message: `Parquet을 읽을 수 없습니다: ${reason}` };
  }

  onStage?.('hashing');
  const hash = await sha256Hex(buffer);
  const existing = await storage.documents.byBlobHash(hash);
  if (existing.length > 0) {
    return {
      status: 'duplicate',
      existingDocumentId: existing[0].id,
      existingTitle: existing[0].title,
    };
  }

  onStage?.('saving');
  const siblings = await storage.documents.inFolder(folderId);
  const sortKey = generateKeyBetween(siblings.at(-1)?.sortKey ?? null, null);
  const draft = createPdfDocument({
    title: titleFromParquetFileName(file.name),
    originalFileName: file.name.slice(0, 300),
    blobHash: hash,
    byteSize: file.size,
    pageCount: 1,
    pageSizes: [JSON_PAGE_SIZE],
    sortKey,
    folderId,
    kind: 'table',
    table: { rows: summary.rows, columns: summary.columns },
  });
  const saved = await storage.transaction(async () => {
    await storage.blobs.put(hash, new Blob([buffer], { type: PARQUET_MIME }));
    return storage.documents.put(draft);
  });
  return { status: 'done', documentId: saved.id };
}

/** hyparquet로 메타데이터만 읽는 기본 검사기 (디코더 자체는 openParquet 안에서 필요할 때 내려받는다) */
export async function inspectParquet(buffer: ArrayBuffer): Promise<ParquetSummary> {
  const table = await openParquet(buffer);
  return { rows: table.rowCount, columns: table.columns.length };
}
