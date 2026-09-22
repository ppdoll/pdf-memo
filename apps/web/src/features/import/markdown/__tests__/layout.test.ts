import { describe, expect, it } from 'vitest';
import {
  CONTENT_WIDTH,
  MARGINS,
  PAGE_SIZE,
  layoutDocument,
  type LaidPage,
  type Metrics,
  type Op,
} from '../layout';
import type { Block, InlineRun, MarkdownDoc } from '../model';

/** 가짜 글자폭: 한글·한자는 정사각형, 나머지는 절반 폭 */
const metrics: Metrics = {
  width: (text, size) =>
    [...text].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? size : size * 0.52), 0),
};

const runs = (text: string, extra: Partial<InlineRun> = {}): InlineRun[] => [{ text, ...extra }];
const paragraph = (text: string): Block => ({ kind: 'paragraph', runs: runs(text) });
const doc = (blocks: Block[]): MarkdownDoc => ({ title: null, blocks });
const texts = (pages: LaidPage[]) =>
  pages.flatMap((p, page) =>
    p.ops
      .filter((o): o is Extract<Op, { type: 'text' }> => o.type === 'text')
      .map((o) => ({ ...o, page })),
  );
const ofType = <T extends Op['type']>(pages: LaidPage[], type: T) =>
  pages.flatMap((p) => p.ops.filter((o): o is Extract<Op, { type: T }> => o.type === type));

describe('layoutDocument', () => {
  it('wraps long paragraphs inside the margins and starts at the top margin', () => {
    const pages = layoutDocument(doc([paragraph('가'.repeat(300))]), metrics);
    const ops = texts(pages);
    expect(pages).toHaveLength(1);
    expect(ops.length).toBeGreaterThan(5);
    expect(ops[0].y).toBeGreaterThan(MARGINS.top);
    for (const op of ops) {
      expect(op.x).toBeGreaterThanOrEqual(MARGINS.left - 0.01);
      expect(op.x + metrics.width(op.text, op.size, op.bold)).toBeLessThanOrEqual(
        PAGE_SIZE.width - MARGINS.right + 0.5,
      );
    }
  });

  it('paginates and never draws text below the bottom margin', () => {
    const pages = layoutDocument(
      doc(Array.from({ length: 120 }, (_, i) => paragraph(`문단 ${i}`))),
      metrics,
    );
    expect(pages.length).toBeGreaterThan(1);
    for (const op of texts(pages)) {
      expect(op.y).toBeLessThanOrEqual(PAGE_SIZE.height - MARGINS.bottom);
      expect(op.y).toBeGreaterThanOrEqual(MARGINS.top);
    }
  });

  it('keeps a heading on the same page as the paragraph that follows it', () => {
    for (let fillers = 30; fillers <= 45; fillers += 1) {
      const blocks: Block[] = Array.from({ length: fillers }, (_, i) => paragraph(`채움 ${i}`));
      blocks.push(
        { kind: 'heading', level: 2, runs: runs('제목 유지') },
        paragraph('따라오는 본문'),
      );
      const ops = texts(layoutDocument(doc(blocks), metrics));
      const heading = ops.find((o) => o.text === '제목 유지');
      const body = ops.find((o) => o.text === '따라오는 본문');
      expect(heading && body && heading.page === body.page).toBe(true);
    }
  });

  it('splits long code blocks across pages with a background on each page', () => {
    const code = Array.from({ length: 90 }, (_, i) => `line ${i}`).join('\n');
    const pages = layoutDocument(doc([{ kind: 'code', text: code, lang: null }]), metrics);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page.ops.some((o) => o.type === 'rect')).toBe(true);
    }
    expect(texts(pages).filter((o) => o.text.startsWith('line ')).length).toBe(90);
  });

  it('repeats the table header on a new page and aligns cells', () => {
    const rows = Array.from({ length: 70 }, (_, i) => [runs(`행 ${i}`), runs(`${i}`)]);
    const pages = layoutDocument(
      doc([{ kind: 'table', header: [runs('이름'), runs('값')], rows, align: ['left', 'right'] }]),
      metrics,
    );
    expect(pages.length).toBeGreaterThan(1);
    const headers = texts(pages).filter((o) => o.text === '이름');
    expect(headers.length).toBe(pages.length);
    const value = texts(pages).find((o) => o.text === '0');
    const name = texts(pages).find((o) => o.text === '행 0');
    expect(value && name && value.x > name.x + CONTENT_WIDTH / 3).toBe(true);
  });

  it('draws quote bars, checkboxes, links and image placeholders', () => {
    const pages = layoutDocument(
      doc([
        { kind: 'quote', blocks: [paragraph('인용문')] },
        {
          kind: 'list',
          ordered: false,
          start: 1,
          items: [
            { runs: runs('할 일'), checked: false, children: [] },
            { runs: runs('끝'), checked: true, children: [] },
          ],
        },
        {
          kind: 'paragraph',
          runs: [
            ...runs('절대 ', {}),
            ...runs('링크', { link: 'https://example.com' }),
            ...runs('상대', { link: './a.md' }),
          ],
        },
        { kind: 'image', src: 'missing.png', alt: '없는 그림' },
        { kind: 'image', src: 'ok.png', alt: '' },
      ]),
      metrics,
      new Map([['ok.png', { width: 2000, height: 500 }]]),
    );
    const bar = ofType(pages, 'rect').find((r) => r.x === MARGINS.left && r.w === 3);
    expect(bar).toBeDefined();
    expect(ofType(pages, 'check').map((c) => c.checked)).toEqual([false, true]);
    const links = ofType(pages, 'link');
    expect(links).toHaveLength(1);
    expect(links[0].href).toBe('https://example.com');
    expect(texts(pages).some((o) => o.text.includes('없는 그림'))).toBe(true);
    const image = ofType(pages, 'image')[0];
    expect(image.w).toBeLessThanOrEqual(CONTENT_WIDTH + 0.01);
    expect(image.h / image.w).toBeCloseTo(0.25, 2);
    expect(image.x + image.w / 2).toBeCloseTo(PAGE_SIZE.width / 2, 1);
  });
});
