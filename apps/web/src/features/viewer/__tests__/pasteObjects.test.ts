import type { PageSize } from '@pdf-memo/shared';
import { describe, expect, it } from 'vitest';
import { TEXT_LINE_HEIGHT, TEXT_PADDING, type TextDefaults } from '../../text/model';
import { PASTE_TEXT_MAX_CHARS, createPastedTextObject, normalizePastedText } from '../pasteObjects';

const DOC_ID = '01a0c69a-b833-7434-b143-ea94aec704b7';
const PAGE: PageSize = { w: 600, h: 800, rotation: 0 };
const defaults: TextDefaults = { color: '#111827', fontSize: 12, background: null, align: 'left' };
/** 글자당 6pt로 재는 가짜 측정기 */
const measure = (s: string) => s.length * 6;

describe('normalizePastedText', () => {
  it('unifies line endings, collapses blank runs, trims and caps length', () => {
    expect(normalizePastedText('  a\r\nb\r\r\n\n\n\nc  ')).toBe('a\nb\n\nc');
    expect(normalizePastedText('x'.repeat(PASTE_TEXT_MAX_CHARS + 10))).toHaveLength(
      PASTE_TEXT_MAX_CHARS,
    );
  });
});

describe('createPastedTextObject', () => {
  it('returns null for empty text', () => {
    expect(createPastedTextObject(DOC_ID, 0, 1, '  \n ', PAGE, defaults, measure)).toBeNull();
  });

  it('sizes a short line to its width (at least the minimum) and centres it', () => {
    const object = createPastedTextObject(DOC_ID, 2, 7, '안녕하세요', PAGE, defaults, measure);
    expect(object).not.toBeNull();
    if (!object) return;
    expect(object.type).toBe('text');
    expect(object.content).toBe('안녕하세요');
    expect(object.pageIndex).toBe(2);
    expect(object.z).toBe(7);
    expect(object.w).toBe(120);
    expect(object.h).toBe(Math.ceil(12 * TEXT_LINE_HEIGHT + TEXT_PADDING * 2));
    expect(object.x + object.w / 2).toBeCloseTo(PAGE.w / 2, 5);
    expect(object.y + object.h / 2).toBeCloseTo(PAGE.h / 2, 5);
    expect(object.bbox).toEqual([object.x, object.y, object.w, object.h]);
  });

  it('caps the width at 80% of the page and grows the height by wrapped lines', () => {
    const long = 'a'.repeat(200); // 1200pt wide at 6pt/char
    const object = createPastedTextObject(DOC_ID, 0, 1, long, PAGE, defaults, measure);
    if (!object) throw new Error('expected a text object');
    expect(object.w).toBe(480);
    // 472pt 안쪽 폭에 글자 78개씩 → 3줄
    expect(object.h).toBe(Math.ceil(3 * 12 * TEXT_LINE_HEIGHT + TEXT_PADDING * 2));
    expect(object.x).toBe(60);
  });

  it('keeps explicit line breaks and uses the longest line for the width', () => {
    const longLine = '가'.repeat(30); // 180pt, 최소 폭 120보다 넓다
    const object = createPastedTextObject(
      DOC_ID,
      0,
      1,
      `짧다\n${longLine}`,
      PAGE,
      defaults,
      measure,
    );
    if (!object) throw new Error('expected a text object');
    expect(object.w).toBe(Math.ceil(30 * 6 + TEXT_PADDING * 2 + 2));
    expect(object.h).toBe(Math.ceil(2 * 12 * TEXT_LINE_HEIGHT + TEXT_PADDING * 2));
    expect(object.content).toBe(`짧다\n${longLine}`);
  });
});
