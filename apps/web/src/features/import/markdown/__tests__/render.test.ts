import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { PDFArray, PDFDocument, PDFName } from 'pdf-lib';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import { PAGE_SIZE } from '../layout';
import { parseMarkdown } from '../parse';
import { renderMarkdownPdf } from '../render';
import { SAMPLE } from './parse.test';

const require = createRequire(import.meta.url);
const fontDir = join(dirname(require.resolve('pretendard/package.json')), 'dist/public/static');
const fonts = {
  regular: new Uint8Array(readFileSync(join(fontDir, 'Pretendard-Regular.otf'))),
  bold: new Uint8Array(readFileSync(join(fontDir, 'Pretendard-Bold.otf'))),
};
const PNG_1X1 = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  ),
);

describe('renderMarkdownPdf', () => {
  it('produces an A4 PDF with embedded Korean text, a link annotation and page numbers', async () => {
    const doc = parseMarkdown(SAMPLE);
    const images = new Map([
      ['https://x/y.png', { mime: 'image/png', bytes: PNG_1X1, width: 400, height: 300 }],
    ]);
    const { bytes, pageCount } = await renderMarkdownPdf({ doc, fonts, images, title: doc.title });
    expect(pageCount).toBe(1);
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 5))).toBe('%PDF-');

    const output = await PDFDocument.load(bytes);
    expect(output.getPageCount()).toBe(1);
    const page = output.getPage(0);
    expect(page.getWidth()).toBeCloseTo(PAGE_SIZE.width, 1);
    expect(page.getHeight()).toBeCloseTo(PAGE_SIZE.height, 1);
    const annots = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
    expect(annots?.size()).toBe(1);
    expect(output.getTitle()).toBe('레시피 모음');

    const pdf = await getDocument({
      data: bytes.slice(),
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;
    const content = await (await pdf.getPage(1)).getTextContent();
    const items = content.items.filter((i) => 'str' in i && i.str.trim());
    const text = items.map((i) => ('str' in i ? i.str : '')).join(' ');
    expect(text).toContain('레시피 모음');
    expect(text).toContain('굵게');
    expect(text).toContain('둘째 줄');
    expect(text).toContain('const a = 1;');
    expect(text).toContain('1 / 1');
    // 기울임은 텍스트 행렬의 기울기(c)로 표현된다
    const italic = items.find((i) => 'str' in i && i.str.includes('기울임'));
    expect(italic && 'transform' in italic && Math.abs(italic.transform[2]) > 0.5).toBe(true);
    await pdf.destroy();
  });

  it('paginates long documents and numbers every page', async () => {
    const md = Array.from(
      { length: 80 },
      (_, i) => `## 절 ${i}\n\n${'한글 본문 '.repeat(20)}\n`,
    ).join('\n');
    const { bytes, pageCount } = await renderMarkdownPdf({ doc: parseMarkdown(md), fonts });
    expect(pageCount).toBeGreaterThan(3);
    const pdf = await getDocument({
      data: bytes.slice(),
      disableFontFace: true,
      useSystemFonts: false,
    }).promise;
    const last = await pdf.getPage(pageCount);
    const content = await last.getTextContent();
    const text = content.items.map((i) => ('str' in i ? i.str : '')).join(' ');
    expect(text).toContain(`${pageCount} / ${pageCount}`);
    await pdf.destroy();
  });
});
