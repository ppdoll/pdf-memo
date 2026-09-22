import 'fake-indexeddb/auto';
import {
  ANNOTATION_SCHEMA_VERSION,
  ROOT_FOLDER_ID,
  createAnnotationBase,
  createPdfDocument,
  type InkObject,
} from '@pdf-memo/shared';
import { PDFDocument } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieStorage } from '../../../storage/dexie/DexieStorage';
import { sha256Hex } from '../../../lib/hash';
import { exportDocument, exportFileName, sanitizeFileName } from '../exportService';

let storage: DexieStorage;

beforeEach(() => {
  storage = new DexieStorage(`export-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  await storage.destroy();
});

async function seed(title: string) {
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 400]);
  const bytes = await pdf.save({ useObjectStreams: false });
  const hash = await sha256Hex(bytes);
  await storage.blobs.put(hash, new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
  const doc = await storage.documents.put(
    createPdfDocument({
      title,
      originalFileName: 'x.pdf',
      blobHash: hash,
      byteSize: bytes.byteLength,
      pageCount: 1,
      pageSizes: [{ w: 300, h: 400, rotation: 0 }],
      sortKey: 'a0',
      folderId: ROOT_FOLDER_ID,
    }),
  );
  const ink: InkObject = {
    ...createAnnotationBase(doc.id, 0, 1, [0, 0, 50, 50]),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    type: 'ink',
    tool: 'pen',
    color: '#1f2937',
    opacity: 1,
    width: 2,
    points: [10, 10, 0.5, 40, 40, 0.5, 70, 20, 0.5],
    smoothing: { thinning: 0.6, streamline: 0.5, smoothing: 0.5 },
  };
  await storage.annotations.put(ink);
  return { doc, bytes };
}

describe('file names', () => {
  it('strips characters that are illegal in file names', () => {
    expect(sanitizeFileName(' 가계부: 2026/09 <최종>?. ')).toBe('가계부 2026 09 최종');
    expect(sanitizeFileName('///')).toBe('문서');
    expect(exportFileName('레시피', 'flattened')).toBe('레시피 (필기).pdf');
    expect(exportFileName('레시피', 'original')).toBe('레시피.pdf');
  });
});

describe('exportDocument', () => {
  it('returns the stored bytes untouched for the original', async () => {
    const { doc, bytes } = await seed('원본');
    const result = await exportDocument(storage, doc.id, 'original');
    expect(result.file.name).toBe('원본.pdf');
    expect(result.file.type).toBe('application/pdf');
    expect(new Uint8Array(await result.file.arrayBuffer())).toEqual(bytes);
    expect(result.drawn).toBe(0);
  });

  it('flattens stored annotations into a new PDF file', async () => {
    const { doc, bytes } = await seed('필기');
    const result = await exportDocument(storage, doc.id, 'flattened');
    expect(result.file.name).toBe('필기 (필기).pdf');
    expect(result.drawn).toBe(1);
    const out = new Uint8Array(await result.file.arrayBuffer());
    expect(out.byteLength).toBeGreaterThan(bytes.byteLength);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it('fails clearly when the document is missing', async () => {
    await expect(exportDocument(storage, 'nope', 'flattened')).rejects.toThrow(
      '문서를 찾을 수 없습니다',
    );
  });
});
