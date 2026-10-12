import 'fake-indexeddb/auto';
import { ROOT_FOLDER_ID, documentKind } from '@pdf-memo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DexieStorage } from '../../../../storage/dexie/DexieStorage';
import { importParquetFile, type ParquetInspector } from '../importParquet';

let storage: DexieStorage;

beforeEach(() => {
  storage = new DexieStorage(`parquet-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  await storage.destroy();
});

/** PAR1 매직만 갖춘 가짜 Parquet 바이트 */
function parquetFile(name: string, body = 'body'): File {
  return new File([`PAR1${body}....PAR1`], name, { type: 'application/vnd.apache.parquet' });
}

const fakeInspect: ParquetInspector = async () => ({ rows: 1234, columns: 7 });

describe('importParquetFile', () => {
  it('stores the raw bytes as a table document with row and column counts', async () => {
    const stages: string[] = [];
    const inspect = vi.fn(fakeInspect);
    const outcome = await importParquetFile(parquetFile('매출 2026.parquet'), {
      storage,
      folderId: ROOT_FOLDER_ID,
      inspect,
      onStage: (s) => stages.push(s),
    });
    expect(outcome.status).toBe('done');
    if (outcome.status !== 'done') return;
    expect(inspect).toHaveBeenCalledTimes(1);
    expect(stages).toEqual(['analyzing', 'hashing', 'saving']);
    const doc = await storage.documents.get(outcome.documentId);
    expect(documentKind(doc!)).toBe('table');
    expect(doc).toMatchObject({
      title: '매출 2026',
      originalFileName: '매출 2026.parquet',
      table: { rows: 1234, columns: 7 },
      pageCount: 1,
    });
    const blob = await storage.blobs.get(doc!.blobHash);
    expect(blob?.type).toBe('application/vnd.apache.parquet');
    expect(await blob!.text()).toBe('PAR1body....PAR1');
  });

  it('rejects files without the parquet magic or that the decoder cannot read', async () => {
    const noMagic = await importParquetFile(
      new File(['not parquet at all'], 'x.parquet', { type: '' }),
      { storage, folderId: ROOT_FOLDER_ID, inspect: fakeInspect },
    );
    expect(noMagic).toMatchObject({ status: 'error', message: expect.stringContaining('PAR1') });
    const broken = await importParquetFile(parquetFile('y.parquet'), {
      storage,
      folderId: ROOT_FOLDER_ID,
      inspect: async () => {
        throw new Error('bad footer');
      },
    });
    expect(broken).toMatchObject({
      status: 'error',
      message: expect.stringContaining('bad footer'),
    });
    expect(await storage.documents.all()).toHaveLength(0);
  });

  it('reports duplicates by content hash and rejects non-parquet or oversized files', async () => {
    const base = { storage, folderId: ROOT_FOLDER_ID, inspect: fakeInspect };
    const first = await importParquetFile(parquetFile('a.parquet', 'same'), base);
    const second = await importParquetFile(parquetFile('b.parquet', 'same'), base);
    expect(first.status).toBe('done');
    expect(second).toMatchObject({ status: 'duplicate', existingTitle: 'a' });

    const wrongType = await importParquetFile(new File(['x'], 'a.csv', { type: 'text/csv' }), base);
    expect(wrongType.status).toBe('error');
    const tooBig = await importParquetFile(parquetFile('big.parquet'), { ...base, maxBytes: 4 });
    expect(tooBig).toMatchObject({
      status: 'error',
      message: expect.stringContaining('너무 큽니다'),
    });
  });
});
