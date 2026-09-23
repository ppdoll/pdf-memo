import {
  ANNOTATION_SCHEMA_VERSION,
  createAnnotationBase,
  type InkObject,
  type NoteObject,
  type TextObject,
} from '@pdf-memo/shared';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PDFDict, PDFDocument, PDFName, degrees, type PDFPage } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { createShapeObject, lineFromEndpoints } from '../../shape/model';
import { createImageObject, withImageGeometry } from '../../sticker/model';
import { EncryptedPdfError, flattenAnnotations, groupByPage } from '../flatten';

const DOC_ID = '01a0c69a-b833-7434-b143-ea94aec704b7';

/** 화면과 같은 Pretendard 폰트를 node_modules에서 읽는다 */
function loadFontBytes(): Uint8Array {
  const require = createRequire(import.meta.url);
  const packageDir = dirname(require.resolve('pretendard/package.json'));
  return new Uint8Array(
    readFileSync(join(packageDir, 'dist/public/static/Pretendard-Regular.otf')),
  );
}

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

const PAGE = { w: 612, h: 792, rotation: 0 as const };
/** 1×1 PNG */
const PNG_1X1 = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  ),
);

function image(pageIndex: number, assetId: string, rotation: number) {
  const ref = { assetId, width: 100, height: 100 };
  const object = createImageObject(DOC_ID, pageIndex, 20, { x: 200, y: 300 }, ref, PAGE);
  return withImageGeometry(object, { rotation }, PAGE);
}

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

  it('embeds the text font and draws text boxes and notes when font bytes are given', async () => {
    const original = await makePdf();
    const text: TextObject = {
      ...createAnnotationBase(DOC_ID, 0, 3, [20, 20, 200, 40]),
      schemaVersion: ANNOTATION_SCHEMA_VERSION,
      type: 'text',
      x: 20,
      y: 20,
      w: 200,
      h: 40,
      rotation: 0,
      content: '한글 메모와 english mixed text\n둘째 줄',
      fontFamily: 'Pretendard',
      fontSize: 14,
      color: '#1f2937',
      align: 'center',
      background: '#fef08a',
    };
    const result = await flattenAnnotations(original, [text, note(0), ink(0, 'pen')], {
      fontBytes: loadFontBytes(),
    });
    expect(result.drawn).toBe(3);
    expect(result.skipped).toBe(0);

    const output = await PDFDocument.load(result.bytes);
    const fonts = output.getPage(0).node.Resources()?.lookup(PDFName.of('Font'), PDFDict);
    expect(fonts && fonts.entries().length > 0).toBe(true);
    expect(result.bytes.byteLength).toBeGreaterThan(original.byteLength + 1000);

    // pdf.js로 다시 읽어 임베드된 CID 폰트의 ToUnicode가 살아 있는지(텍스트 추출) 확인
    const pdf = await getDocument({
      data: result.bytes.slice(),
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    const extracted = content.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    expect(extracted).toContain('한글 메모와');
    expect(extracted).toContain('english mixed text');
    expect(extracted).toContain('둘째 줄');
    await pdf.destroy();
  });

  it('draws pack stickers as vectors and user images as XObjects, skipping unknown assets', async () => {
    const original = await makePdf();
    const sticker = image(0, 'pack:basic/heart-red', 30);
    const photo = image(0, 'f'.repeat(64), -15);
    const missing = image(1, 'e'.repeat(64), 0);
    const assets = new Map([[photo.assetId, { mime: 'image/png', bytes: PNG_1X1 }]]);
    const result = await flattenAnnotations(original, [sticker, photo, missing], { assets });
    expect(result.drawn).toBe(2);
    expect(result.skipped).toBe(1);

    const output = await PDFDocument.load(result.bytes);
    const xobjects = output
      .getPage(0)
      .node.Resources()
      ?.lookupMaybe(PDFName.of('XObject'), PDFDict);
    expect(xobjects?.entries().length).toBe(1);
    expect(
      output.getPage(1).node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict),
    ).toBeUndefined();
  });

  it('draws shapes as vector paths with fills, dashes and arrow heads', async () => {
    const original = await makePdf();
    const style = {
      kind: 'rect' as const,
      stroke: '#ef4444',
      strokeWidth: 2,
      fill: '#fef08a',
      dashed: true,
    };
    const shapes = [
      createShapeObject(DOC_ID, 0, 1, { x: 40, y: 40, w: 120, h: 60, rotation: 20 }, style),
      createShapeObject(
        DOC_ID,
        0,
        2,
        { x: 200, y: 40, w: 80, h: 80, rotation: 0 },
        { ...style, kind: 'ellipse', dashed: false },
      ),
      createShapeObject(DOC_ID, 0, 3, lineFromEndpoints({ x: 40, y: 200 }, { x: 240, y: 260 }), {
        ...style,
        kind: 'line',
        fill: null,
      }),
      createShapeObject(DOC_ID, 1, 4, lineFromEndpoints({ x: 60, y: 60 }, { x: 60, y: 200 }), {
        ...style,
        kind: 'arrow',
        fill: null,
        dashed: false,
      }),
    ];
    const result = await flattenAnnotations(original, shapes);
    expect(result.drawn).toBe(4);
    expect(result.skipped).toBe(0);
    const output = await PDFDocument.load(result.bytes);
    expect(output.getPageCount()).toBe(2);
    expect(result.bytes.byteLength).toBeGreaterThan(original.byteLength);
  });

  it('rejects encrypted PDFs with a readable error', async () => {
    const fake = new TextEncoder().encode('%PDF-1.4\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF');
    await expect(flattenAnnotations(fake, [])).rejects.toBeInstanceOf(Error);
    expect(new EncryptedPdfError().message).toContain('암호');
  });
});
