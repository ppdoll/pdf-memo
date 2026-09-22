import 'fake-indexeddb/auto';
import { ROOT_FOLDER_ID } from '@pdf-memo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DexieStorage } from '../../../storage/dexie/DexieStorage';
import { importPdfFile, isPdfFile, titleFromFileName, type PdfAnalyzer } from '../import/importPdf';

const fakeAnalyze: PdfAnalyzer = async () => ({
  pageCount: 2,
  pageSizes: [
    { w: 612, h: 792, rotation: 0 },
    { w: 612, h: 792, rotation: 90 },
  ],
  thumbnail: { blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), width: 240, height: 311 },
});

function pdfFile(name: string, content = '%PDF-1.4 sample'): File {
  return new File([content], name, { type: 'application/pdf' });
}

let storage: DexieStorage;

beforeEach(() => {
  storage = new DexieStorage(`import-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  await storage.destroy();
});

describe('helpers', () => {
  it('recognizes PDFs by mime type or extension', () => {
    expect(isPdfFile(pdfFile('a.pdf'))).toBe(true);
    expect(isPdfFile(new File(['x'], 'b.PDF', { type: '' }))).toBe(true);
    expect(isPdfFile(new File(['x'], 'c.png', { type: 'image/png' }))).toBe(false);
  });

  it('derives a title from the file name', () => {
    expect(titleFromFileName('  가계부 2026.PDF ')).toBe('가계부 2026');
    expect(titleFromFileName('.pdf')).toBe('제목 없음');
  });
});

describe('importPdfFile', () => {
  it('stores blob, thumbnail and document atomically and reports stages', async () => {
    const stages: string[] = [];
    const outcome = await importPdfFile(pdfFile('레시피.pdf'), {
      storage,
      analyze: fakeAnalyze,
      folderId: ROOT_FOLDER_ID,
      onStage: (s) => stages.push(s),
    });

    expect(outcome.status).toBe('done');
    if (outcome.status !== 'done') return;
    expect(stages).toEqual(['hashing', 'analyzing', 'saving']);

    const doc = await storage.documents.get(outcome.documentId);
    expect(doc).toMatchObject({
      title: '레시피',
      originalFileName: '레시피.pdf',
      pageCount: 2,
      folderId: ROOT_FOLDER_ID,
      rev: 1,
    });
    expect(doc?.pageSizes[1].rotation).toBe(90);
    expect(await storage.blobs.has(doc!.blobHash)).toBe(true);
    expect((await storage.blobs.info(doc!.blobHash))?.refCount).toBe(1);
    const thumb = await storage.assets.get(doc!.thumbnailAssetId!);
    expect(thumb?.kind).toBe('thumbnail');
    expect(thumb?.width).toBe(240);
  });

  it('detects a duplicate by content hash and does not create a second document', async () => {
    const first = await importPdfFile(pdfFile('a.pdf', 'same-bytes'), {
      storage,
      analyze: fakeAnalyze,
      folderId: ROOT_FOLDER_ID,
    });
    const second = await importPdfFile(pdfFile('renamed.pdf', 'same-bytes'), {
      storage,
      analyze: fakeAnalyze,
      folderId: ROOT_FOLDER_ID,
    });
    expect(first.status).toBe('done');
    expect(second).toMatchObject({ status: 'duplicate', existingTitle: 'a' });
    expect((await storage.documents.inFolder(ROOT_FOLDER_ID)).length).toBe(1);
  });

  it('rejects non-PDF, empty and oversized files before touching storage', async () => {
    const analyze = vi.fn(fakeAnalyze);
    const base = { storage, analyze, folderId: ROOT_FOLDER_ID };
    expect(
      await importPdfFile(new File(['x'], 'img.png', { type: 'image/png' }), base),
    ).toMatchObject({ status: 'error', message: expect.stringContaining('PDF') });
    expect(await importPdfFile(pdfFile('empty.pdf', ''), base)).toMatchObject({ status: 'error' });
    expect(
      await importPdfFile(pdfFile('big.pdf', 'x'.repeat(50)), { ...base, maxBytes: 10 }),
    ).toMatchObject({
      status: 'error',
      message: expect.stringContaining('너무 큽니다'),
    });
    expect(analyze).not.toHaveBeenCalled();
    expect(await storage.stats()).toMatchObject({ documents: 0, pdfBlobs: 0 });
  });

  it('reports analyzer failures without leaving a blob behind', async () => {
    const outcome = await importPdfFile(pdfFile('broken.pdf'), {
      storage,
      analyze: async () => {
        throw new Error('Invalid PDF structure');
      },
      folderId: ROOT_FOLDER_ID,
    });
    expect(outcome).toMatchObject({
      status: 'error',
      message: expect.stringContaining('Invalid PDF'),
    });
    expect(await storage.stats()).toMatchObject({ documents: 0, pdfBlobs: 0, assets: 0 });
  });

  it('appends new documents after existing ones in the folder order', async () => {
    const a = await importPdfFile(pdfFile('a.pdf', 'A'), {
      storage,
      analyze: fakeAnalyze,
      folderId: ROOT_FOLDER_ID,
    });
    const b = await importPdfFile(pdfFile('b.pdf', 'B'), {
      storage,
      analyze: fakeAnalyze,
      folderId: ROOT_FOLDER_ID,
    });
    if (a.status !== 'done' || b.status !== 'done') throw new Error('import failed');
    const docs = await storage.documents.inFolder(ROOT_FOLDER_ID);
    expect(docs.map((d) => d.id)).toEqual([a.documentId, b.documentId]);
    expect(docs[0].sortKey < docs[1].sortKey).toBe(true);
  });
});
