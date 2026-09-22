import { describe, expect, it } from 'vitest';
import { collectImageSources, plainText } from '../model';
import { parseMarkdown, plainTextToMarkdown, sanitizeText } from '../parse';

export const SAMPLE = [
  '# 레시피 🍰 모음',
  '',
  '본문 **굵게** *기울임* [링크](https://a.b) `코드` ~~취소~~ 줄  ',
  '둘째 줄',
  '',
  '- [ ] 할 일',
  '- [x] 끝난 일',
  '1. 하나',
  '   - 하위 항목',
  '',
  '> 인용 **강조**',
  '',
  '```js',
  'const a = 1;',
  '```',
  '',
  '| 왼쪽 | 가운데 |',
  '|:---|:---:|',
  '| 1 | 2 |',
  '',
  '---',
  '',
  '![대체](https://x/y.png)',
  '',
  '<div>html &amp; 텍스트</div>',
  '',
].join('\n');

describe('sanitizeText', () => {
  it('removes emoji, decodes entities and expands tabs', () => {
    expect(sanitizeText('a 🍰 b\tc &amp; &lt;d&gt;')).toBe('a  b    c & <d>');
    expect(sanitizeText('줄\r\n바꿈')).toBe('줄\n바꿈');
  });
});

describe('parseMarkdown', () => {
  const doc = parseMarkdown(SAMPLE);

  it('takes the first H1 as the title and keeps block order', () => {
    expect(doc.title).toBe('레시피 모음');
    expect(doc.blocks.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'list',
      'list',
      'quote',
      'code',
      'table',
      'hr',
      'image',
      'paragraph',
    ]);
  });

  it('keeps inline styles as runs including hard line breaks', () => {
    const paragraph = doc.blocks[1];
    if (paragraph.kind !== 'paragraph') throw new Error('expected paragraph');
    const styles = paragraph.runs.map((r) => ({
      text: r.text,
      bold: !!r.bold,
      italic: !!r.italic,
      code: !!r.code,
      strike: !!r.strike,
      link: r.link ?? null,
    }));
    expect(styles).toContainEqual({
      text: '굵게',
      bold: true,
      italic: false,
      code: false,
      strike: false,
      link: null,
    });
    expect(styles).toContainEqual({
      text: '기울임',
      bold: false,
      italic: true,
      code: false,
      strike: false,
      link: null,
    });
    expect(styles).toContainEqual({
      text: '링크',
      bold: false,
      italic: false,
      code: false,
      strike: false,
      link: 'https://a.b',
    });
    expect(styles.some((s) => s.code && s.text === '코드')).toBe(true);
    expect(styles.some((s) => s.strike && s.text === '취소')).toBe(true);
    expect(paragraph.runs.some((r) => r.text === '\n')).toBe(true);
    expect(plainText(paragraph.runs)).toContain('둘째 줄');
  });

  it('parses task items, nested lists, quotes, code, tables and images', () => {
    const [, , tasks, ordered, quote, code, table, , image, html] = doc.blocks;
    if (tasks.kind !== 'list' || ordered.kind !== 'list') throw new Error('expected lists');
    expect(tasks.items.map((i) => i.checked)).toEqual([false, true]);
    expect(ordered.ordered).toBe(true);
    expect(ordered.items[0].children).toHaveLength(1);
    expect(ordered.items[0].children[0].kind).toBe('list');

    if (quote.kind !== 'quote') throw new Error('expected quote');
    expect(quote.blocks[0].kind).toBe('paragraph');

    if (code.kind !== 'code') throw new Error('expected code');
    expect(code).toMatchObject({ text: 'const a = 1;', lang: 'js' });

    if (table.kind !== 'table') throw new Error('expected table');
    expect(table.align).toEqual(['left', 'center']);
    expect(table.header.map(plainText)).toEqual(['왼쪽', '가운데']);
    expect(table.rows[0].map(plainText)).toEqual(['1', '2']);

    if (image.kind !== 'image') throw new Error('expected image');
    expect(image).toEqual({ kind: 'image', src: 'https://x/y.png', alt: '대체' });

    if (html.kind !== 'paragraph') throw new Error('expected paragraph');
    expect(plainText(html.runs)).toBe('html & 텍스트');
    expect(collectImageSources(doc.blocks)).toEqual(['https://x/y.png']);
  });

  it('falls back to a null title when there is no H1', () => {
    expect(parseMarkdown('## 소제목\n\n본문').title).toBeNull();
    expect(parseMarkdown('그냥 글').blocks).toEqual([
      { kind: 'paragraph', runs: [{ text: '그냥 글' }] },
    ]);
  });
});

describe('plainTextToMarkdown', () => {
  it('keeps every line break and escapes markdown markers', () => {
    const md = plainTextToMarkdown('첫 줄\n# 둘째\n\n- 셋째');
    expect(md).toBe('첫 줄  \n\\# 둘째  \n  \n\\- 셋째');
    const doc = parseMarkdown(md);
    expect(doc.blocks.every((b) => b.kind === 'paragraph')).toBe(true);
    expect(plainText(doc.blocks[0].kind === 'paragraph' ? doc.blocks[0].runs : [])).toBe(
      '첫 줄 # 둘째',
    );
  });
});
