import {
  ANNOTATION_SCHEMA_VERSION,
  createAnnotationBase,
  type InkObject,
  type NoteObject,
} from '@pdf-memo/shared';
import { PDFDict, PDFDocument, PDFName, degrees, type PDFPage } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { EncryptedPdfError, flattenAnnotations, groupByPage } from '../flatten';

const DOC_ID = '01a0c69a-b833-7434-b143-ea94aec704b7';

async function makePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([612, 792]);
  const second = doc.addPage([612, 792]);
  second.setCropBox(50, 40, 500, 700);
  second.setRotation(degrees(90));
  return doc.save({ useObjectStreams: false });
}

function ink(pageIndex: number, tool: InkObject['tool'], z = 1): InkObject {
  return {
    ...createAnnotationBase(DOC_ID, pageIndex, z, [10, 10, 100, 40]),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    type: 'ink',
    tool,
    color: tool === 'highlighter' ? '#fde047' : '#ff0000',
    opacity: tool === 'highlighter' ? 0.9 : 1,
    width: tool === 'highlighter' ? 12 : 3,
    points: [10, 10, 0.5, 60, 20, 0.7, 110, 50, 0.4],
    smoothing: { thinning: tool === 'pen' ? 0.6 : 0, streamline: 0.5, smoothing: 0.5 },
  };
}

function note(pageIndex: number): NoteObject {
  return {
    ...createAnnotationBase(DOC_ID, pageIndex, 9, [5, 5, 20, 20]),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    type: 'note',
    x: 5,
    y: 5,
    content: '메모',
    color: '#fde047',
    collapsed: true,
  };
}

const latin1 = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes);

/** 페이지 리소스의 ExtGState에 선언된 블렌드 모드 목록 */
function blendModes(page: PDFPage): string[] {
  const states = page.node.Resources()?.lookup(PDFName.of('ExtGState'), PDFDict);
  if (!states) return [];
  return states
    .entries()
    .map(([, value]) =>
      value instanceof PDFDict ? value.get(PDFName.of('BM'))?.toString() : undefined,
    )
    .filter((v): v is string => typeof v === 'string');
}

describe('groupByPage', () => {
  it('drops tombstones, sorts by z within a page and orders pages ascending', () => {
    const a = ink(1, 'pen', 5);
    const b = ink(1, 'marker', 2);
    const gone = { ...ink(0, 'pen'), deletedAt: '2026-09-22T00:00:00.000Z' };
    const grouped = groupByPage([a, gone, b, ink(0, 'highlighter')]);
    expect([...grouped.keys()]).toEqual([0, 1]);
    expect(grouped.get(0)?.map((o) => o.type)).toEqual(['ink']);
    expect(grouped.get(1)?.map((o) => o.z)).toEqual([2, 5]);
  });
});

describe('flattenAnnotations', () => {
  it('draws ink as vector paths, keeps page count, and reports skipped objects', async () => {
    const original = await makePdf();
    const result = await flattenAnnotations(original, [
      ink(0, 'pen'),
      ink(1, 'highlighter'),
      note(0),
      ink(7, 'pen'),
    ]);

    expect(result.drawn).toBe(2);
    expect(result.skipped).toBe(2);

    const output = await PDFDocument.load(result.bytes);
    expect(output.getPageCount()).toBe(2);
    expect(output.getPage(1).getRotation().angle).toBe(90);
    expect(output.getPage(1).getCropBox()).toEqual({ x: 50, y: 40, width: 500, height: 700 });

    // 형광펜 페이지에는 multiply 블렌드 ExtGState가, 펜 페이지에는 없어야 한다
    expect(blendModes(output.getPage(1))).toContain('/Multiply');
    expect(blendModes(output.getPage(0))).not.toContain('/Multiply');
    expect(latin1(result.bytes).startsWith('%PDF-')).toBe(true);
    expect(result.bytes.byteLength).toBeGreaterThan(original.byteLength);
  });

  it('reports progress per page that has annotations and leaves untouched pages alone', async () => {
    const original = await makePdf();
    const progress: Array<[number, number]> = [];
    const result = await flattenAnnotations(original, [ink(1, 'marker')], {
      onProgress: (done, total) => progress.push([done, total]),
    });
    expect(progress).toEqual([[1, 1]]);
    expect(result.drawn).toBe(1);
    const output = await PDFDocument.load(result.bytes);
    expect(output.getPageCount()).toBe(2);
  });

  it('produces a valid PDF when there is nothing to draw', async () => {
    const original = await makePdf();
    const result = await flattenAnnotations(original, []);
    expect(result).toMatchObject({ drawn: 0, skipped: 0 });
    expect((await PDFDocument.load(result.bytes)).getPageCount()).toBe(2);
  });

  it('rejects encrypted PDFs with a readable error', async () => {
    const fake = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF');
    await expect(flattenAnnotations(fake, [])).rejects.toBeInstanceOf(Error);
    expect(new EncryptedPdfError().message).toContain('암호');
  });
});
