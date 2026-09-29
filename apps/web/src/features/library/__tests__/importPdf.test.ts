import 'fake-indexeddb/auto';
import { ROOT_FOLDER_ID } from '@pdf-memo/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DexieStorage } from '../../../storage/dexie/DexieStorage';
import { PdfPasswordError } from '../../import/encrypted/errors';
import { importPdfFile, isPdfFile, titleFromFileName, type PdfAnalyzer } from '../import/importPdf';

const fakeAnalyze: PdfAnalyzer = async () => ({
  pageCount: 2,
  pageSizes: [
    { w: 612, h: 792, rotation: 0 },
    { w: 612, h: 792, rotation: 90 },
  ],
  thumbnail: { blob: new Blob(['jpeg-bytes'], { type: 'image/jpeg' }), width: 240, height: 311 },
  encrypted: false,
});

/** pdf.js가 암호 없이 열지 못할 때 던지는 예외 흉내 */
class FakePasswordException extends Error {
  code: number;
  constructor(code: number) {
    super(code === 1 ? 'No password given' : 'Incorrect Password');
    this.name = 'PasswordException';
    this.code = code;
  }
}

const LOCKED = 'locked-bytes';
const OWNER_LOCKED = 'owner-locked-bytes';

/** 잠긴 내용이면 pdf.js처럼 실패하고, 소유자 암호만 걸린 내용이면 encrypted를 알린다 */
const lockAwareAnalyze: PdfAnalyzer = async (blob) => {
  const text = await blob.text();
  if (text === LOCKED) throw new FakePasswordException(1);
  return { ...(await fakeAnalyze(blob)), encrypted: text === OWNER_LOCKED };
};

function fakeDecrypt(correct = 'secret') {
  return vi.fn(async (file: File, password: string): Promise<File> => {
    const text = await file.text();
    if (text === LOCKED && password !== correct) throw new PdfPasswordError();
    return new File([`unlocked:${text}`], file.name, { type: 'application/pdf' });
  });
}

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

describe('importPdfFile with encrypted PDFs', () => {
  it('asks for the password, decrypts and stores the unlocked bytes', async () => {
    const stages: string[] = [];
    const requestPassword = vi.fn(async () => 'secret');
    const decrypt = fakeDecrypt();
    const outcome = await importPdfFile(pdfFile('잠김.pdf', LOCKED), {
      storage,
      analyze: lockAwareAnalyze,
      folderId: ROOT_FOLDER_ID,
      onStage: (s) => stages.push(s),
      requestPassword,
      decrypt,
    });
    expect(outcome).toMatchObject({ status: 'done', decrypted: true });
    if (outcome.status !== 'done') return;
    expect(requestPassword).toHaveBeenCalledWith({ fileName: '잠김.pdf', attempt: 1 });
    expect(decrypt).toHaveBeenCalledTimes(1);
    expect(stages).toEqual([
      'hashing',
      'analyzing',
      'password',
      'decrypting',
      'hashing',
      'analyzing',
      'saving',
    ]);
    const doc = await storage.documents.get(outcome.documentId);
    const stored = await storage.blobs.get(doc!.blobHash);
    expect(await stored!.text()).toBe(`unlocked:${LOCKED}`);
    expect(doc?.byteSize).toBe(stored!.size);
    expect(doc?.originalFileName).toBe('잠김.pdf');
  });

  it('asks again after a wrong password and reports the attempt number', async () => {
    const answers = ['wrong', 'secret'];
    const requestPassword = vi.fn(async () => answers.shift() ?? null);
    const outcome = await importPdfFile(pdfFile('잠김.pdf', LOCKED), {
      storage,
      analyze: lockAwareAnalyze,
      folderId: ROOT_FOLDER_ID,
      requestPassword,
      decrypt: fakeDecrypt(),
    });
    expect(outcome).toMatchObject({ status: 'done', decrypted: true });
    expect(requestPassword).toHaveBeenNthCalledWith(1, { fileName: '잠김.pdf', attempt: 1 });
    expect(requestPassword).toHaveBeenNthCalledWith(2, { fileName: '잠김.pdf', attempt: 2 });
  });

  it('gives up cleanly when the prompt is cancelled', async () => {
    const decrypt = fakeDecrypt();
    const outcome = await importPdfFile(pdfFile('잠김.pdf', LOCKED), {
      storage,
      analyze: lockAwareAnalyze,
      folderId: ROOT_FOLDER_ID,
      requestPassword: async () => null,
      decrypt,
    });
    expect(outcome).toEqual({ status: 'cancelled' });
    expect(decrypt).not.toHaveBeenCalled();
    expect(await storage.stats()).toMatchObject({ documents: 0, pdfBlobs: 0 });
  });

  it('silently removes owner-only restrictions with an empty password', async () => {
    const requestPassword = vi.fn(async () => 'never');
    const decrypt = fakeDecrypt();
    const outcome = await importPdfFile(pdfFile('제한.pdf', OWNER_LOCKED), {
      storage,
      analyze: lockAwareAnalyze,
      folderId: ROOT_FOLDER_ID,
      requestPassword,
      decrypt,
    });
    expect(outcome).toMatchObject({ status: 'done', decrypted: true });
    expect(requestPassword).not.toHaveBeenCalled();
    expect(decrypt).toHaveBeenCalledWith(expect.any(File), '');
    if (outcome.status !== 'done') return;
    const doc = await storage.documents.get(outcome.documentId);
    const stored = await storage.blobs.get(doc!.blobHash);
    expect(await stored!.text()).toBe(`unlocked:${OWNER_LOCKED}`);
  });

  it('treats a second import of the same locked file as a duplicate of the unlocked one', async () => {
    const base = {
      storage,
      analyze: lockAwareAnalyze,
      folderId: ROOT_FOLDER_ID,
      requestPassword: async () => 'secret',
      decrypt: fakeDecrypt(),
    };
    const first = await importPdfFile(pdfFile('잠김.pdf', LOCKED), base);
    const second = await importPdfFile(pdfFile('잠김 복사본.pdf', LOCKED), base);
    expect(first.status).toBe('done');
    expect(second).toMatchObject({ status: 'duplicate', existingTitle: '잠김' });
  });

  it('reports locked files as an error when no prompt is available', async () => {
    const outcome = await importPdfFile(pdfFile('잠김.pdf', LOCKED), {
      storage,
      analyze: lockAwareAnalyze,
      folderId: ROOT_FOLDER_ID,
    });
    expect(outcome).toMatchObject({ status: 'error', message: expect.stringContaining('암호') });
    expect(await storage.stats()).toMatchObject({ documents: 0, pdfBlobs: 0 });
  });

  it('stores owner-restricted files as they are when no decryptor is available', async () => {
    const outcome = await importPdfFile(pdfFile('제한.pdf', OWNER_LOCKED), {
      storage,
      analyze: lockAwareAnalyze,
      folderId: ROOT_FOLDER_ID,
    });
    expect(outcome).toMatchObject({ status: 'done', decrypted: false });
  });
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
