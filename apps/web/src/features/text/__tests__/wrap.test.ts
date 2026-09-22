import { describe, expect, it } from 'vitest';
import { tokenize, wrapText } from '../wrap';

/** 글자당 10 단위인 가짜 측정기 */
const measure = (s: string) => [...s].length * 10;

describe('tokenize', () => {
  it('keeps latin words with their trailing space and splits CJK per character', () => {
    expect(tokenize('hello world')).toEqual(['hello ', 'world']);
    expect(tokenize('가계부 정리')).toEqual(['가', '계', '부', ' ', '정', '리']);
    expect(tokenize('PDF메모 test')).toEqual(['PDF', '메', '모', ' ', 'test']);
  });
});

describe('wrapText', () => {
  it('wraps latin text at spaces and never exceeds the width', () => {
    const lines = wrapText('the quick brown fox jumps', 100, measure);
    expect(lines).toEqual(['the quick', 'brown fox', 'jumps']);
    for (const line of lines) expect(measure(line)).toBeLessThanOrEqual(100);
  });

  it('wraps korean text per character', () => {
    expect(wrapText('가나다라마바사아자차', 50, measure)).toEqual(['가나다라마', '바사아자차']);
  });

  it('breaks an over-long word by characters', () => {
    expect(wrapText('abcdefghijkl xy', 50, measure)).toEqual(['abcde', 'fghij', 'kl xy']);
  });

  it('preserves explicit line breaks and empty lines', () => {
    expect(wrapText('첫 줄\n\n둘째 줄', 200, measure)).toEqual(['첫 줄', '', '둘째 줄']);
    expect(wrapText('a\r\nb', 200, measure)).toEqual(['a', 'b']);
  });

  it('drops leading spaces on wrapped lines and handles empty input', () => {
    expect(wrapText('aaaa    bbbb', 50, measure)).toEqual(['aaaa', 'bbbb']);
    expect(wrapText('', 50, measure)).toEqual(['']);
  });
});
