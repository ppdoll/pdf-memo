import { describe, expect, it } from 'vitest';
import {
  detectPastedKind,
  jsonProblem,
  looksLikeMarkdown,
  pastedTextToFile,
  titleFromPastedText,
} from '../detect';

describe('detectPastedKind', () => {
  it('recognizes JSON objects and arrays', () => {
    expect(detectPastedKind('{"a": 1, "b": [1, 2]}')).toBe('json');
    expect(detectPastedKind('  [1, 2, 3]\n')).toBe('json');
    expect(detectPastedKind('{not json')).toBe('text');
  });

  it('treats headings, fences, tables, links, quotes and bold as markdown', () => {
    expect(detectPastedKind('# 장보기\n우유')).toBe('markdown');
    expect(detectPastedKind('코드:\n```js\nlet a = 1\n```')).toBe('markdown');
    expect(detectPastedKind('| 이름 | 값 |\n| --- | --- |')).toBe('markdown');
    expect(detectPastedKind('참고 [링크](https://example.com)')).toBe('markdown');
    expect(detectPastedKind('> 인용문')).toBe('markdown');
    expect(detectPastedKind('이건 **중요**')).toBe('markdown');
  });

  it('needs at least two list lines, otherwise plain text', () => {
    expect(looksLikeMarkdown('- 하나')).toBe(false);
    expect(looksLikeMarkdown('- 하나\n- 둘')).toBe(true);
    expect(looksLikeMarkdown('1. 하나\n2) 둘')).toBe(true);
    expect(detectPastedKind('그냥 메모입니다.\n두 번째 줄')).toBe('text');
    expect(detectPastedKind('')).toBe('text');
  });
});

describe('titleFromPastedText', () => {
  const now = new Date(2026, 9, 1, 14, 5);

  it('uses the first heading for markdown and the first line otherwise', () => {
    expect(titleFromPastedText('들어가며\n# 진짜 제목\n본문', 'markdown', now)).toBe('진짜 제목');
    expect(titleFromPastedText('\n\n  첫 줄입니다  \n둘째', 'text', now)).toBe('첫 줄입니다');
  });

  it('strips markdown markers and links from the title', () => {
    expect(titleFromPastedText('- **할 일** [목록](x)', 'text', now)).toBe('할 일 목록');
  });

  it('falls back to a dated title for JSON and empty text', () => {
    expect(titleFromPastedText('{"a":1}', 'json', now)).toBe('붙여넣은 JSON 2026-10-01 14:05');
    expect(titleFromPastedText('   ', 'text', now)).toBe('붙여넣은 글 2026-10-01 14:05');
  });

  it('caps the title length', () => {
    expect(titleFromPastedText('가'.repeat(200), 'text', now)).toHaveLength(80);
  });
});

describe('pastedTextToFile', () => {
  it('names the file by kind and sanitizes the title', async () => {
    const md = pastedTextToFile('# a\r\nb', 'markdown', '장보기: 10/1?');
    expect(md.name).toBe('장보기 10 1.md');
    expect(md.type).toBe('text/markdown');
    expect(await md.text()).toBe('# a\nb');
    expect(pastedTextToFile('x', 'text', '메모').name).toBe('메모.txt');
    expect(pastedTextToFile('{}', 'json', '   ').name).toBe('붙여넣기.json');
  });
});

describe('jsonProblem', () => {
  it('returns null for valid JSON and a message otherwise', () => {
    expect(jsonProblem('{"ok": true}')).toBeNull();
    expect(jsonProblem('{oops}')).toMatch(/JSON/);
  });
});
