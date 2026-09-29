import { createRequire } from 'node:module';
import createModule from '@neslinesli93/qpdf-wasm';
import { PDFDocument, rgb } from 'pdf-lib';
import { beforeAll, describe, expect, it } from 'vitest';
import { PdfPasswordError } from '../errors';
import {
  createQpdfRunner,
  decryptWithQpdf,
  type QpdfFactory,
  type QpdfRunner,
} from '../qpdfDecrypt';

const require = createRequire(import.meta.url);
const wasmPath = require.resolve('@neslinesli93/qpdf-wasm/dist/qpdf.wasm');

let qpdf: QpdfRunner;
let plain: Uint8Array;

/** qpdf 자신으로 시험용 암호 PDF를 만든다 (AES-256) */
function encrypt(bytes: Uint8Array, user: string, owner: string, extra: string[] = []): Uint8Array {
  qpdf.fs.writeFile('/plain.pdf', bytes);
  const { code, messages } = qpdf.run([
    '--encrypt',
    user,
    owner,
    '256',
    ...extra,
    '--',
    '/plain.pdf',
    '/enc.pdf',
  ]);
  if (code !== 0) throw new Error(messages.join('\n'));
  const out = qpdf.fs.readFile('/enc.pdf');
  qpdf.fs.unlink('/plain.pdf');
  qpdf.fs.unlink('/enc.pdf');
  return out;
}

const hasEncryptDict = (bytes: Uint8Array) =>
  new TextDecoder('latin1').decode(bytes).includes('/Encrypt');

beforeAll(async () => {
  qpdf = await createQpdfRunner(createModule as unknown as QpdfFactory, () => wasmPath);
  const doc = await PDFDocument.create();
  const page = doc.addPage([300, 200]);
  page.drawRectangle({ x: 20, y: 20, width: 100, height: 60, color: rgb(0.2, 0.4, 0.9) });
  plain = await doc.save({ useObjectStreams: true });
}, 30_000);

describe('decryptWithQpdf', () => {
  it('unlocks with the user or the owner password and yields a PDF pdf-lib can open', async () => {
    const locked = encrypt(plain, 'user1', 'owner1');
    expect(hasEncryptDict(locked)).toBe(true);
    await expect(PDFDocument.load(locked)).rejects.toThrow(/encrypt/i);

    const outputs: Uint8Array[] = [];
    for (const password of ['user1', 'owner1']) {
      const out = decryptWithQpdf(qpdf, locked, password);
      expect(hasEncryptDict(out)).toBe(false);
      const reopened = await PDFDocument.load(out);
      expect(reopened.getPageCount()).toBe(1);
      outputs.push(out);
    }
    // 같은 파일은 어느 암호로 풀어도 같은 바이트여야 가져오기의 중복 감지가 맞는다
    expect(Buffer.from(outputs[0]).equals(Buffer.from(outputs[1]))).toBe(true);
  });

  it('accepts non-ASCII passwords', () => {
    const locked = encrypt(plain, '비밀번호', 'owner1');
    const out = decryptWithQpdf(qpdf, locked, '비밀번호');
    expect(hasEncryptDict(out)).toBe(false);
  });

  it('throws PdfPasswordError for a wrong or missing password', () => {
    const locked = encrypt(plain, 'user1', 'owner1');
    expect(() => decryptWithQpdf(qpdf, locked, 'nope')).toThrow(PdfPasswordError);
    expect(() => decryptWithQpdf(qpdf, locked, '')).toThrow(PdfPasswordError);
  });

  it('removes owner-only restrictions with an empty password', async () => {
    const restricted = encrypt(plain, '', 'owner1', ['--print=none', '--modify=none']);
    await expect(PDFDocument.load(restricted)).rejects.toThrow(/encrypt/i);
    const out = decryptWithQpdf(qpdf, restricted, '');
    expect(hasEncryptDict(out)).toBe(false);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it('passes unencrypted PDFs through', async () => {
    const out = decryptWithQpdf(qpdf, plain, '');
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
  });

  it('reports other failures with the qpdf message and cleans up its files', () => {
    const garbage = new TextEncoder().encode('this is not a pdf');
    let caught: unknown;
    try {
      decryptWithQpdf(qpdf, garbage, '');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught).not.toBeInstanceOf(PdfPasswordError);
    expect((caught as Error).message).toMatch(/startxref/);
    expect((caught as Error).message).not.toMatch(/in\.pdf/);
    expect(() => qpdf.fs.readFile('/in.pdf')).toThrow();
    expect(() => qpdf.fs.readFile('/out.pdf')).toThrow();
  });
});
