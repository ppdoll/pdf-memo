import { describe, expect, it } from 'vitest';
import {
  childEntries,
  describeJsonError,
  findMatches,
  formatPrimitive,
  joinPath,
  summarize,
  type JsonValue,
} from '../model';

const SAMPLE: JsonValue = {
  name: '레시피',
  servings: 4,
  vegan: false,
  note: null,
  'a/b': { '~x': 1 },
  ingredients: [
    { item: '김치', amount: '200g' },
    { item: '밥', amount: '2공기' },
  ],
  steps: ['김치를 볶는다', '밥을 넣는다'],
};

describe('json model helpers', () => {
  it('summarises containers and lists children in order', () => {
    expect(summarize({})).toBe('{}');
    expect(summarize([])).toBe('[]');
    expect(summarize({ a: 1, b: 2 })).toBe('{…} 2개 키');
    expect(summarize([1, 2, 3])).toBe('[…] 3개 항목');
    expect(childEntries([10, 20]).map(([k]) => k)).toEqual(['0', '1']);
    expect(childEntries({ x: 1, y: 2 }).map(([k]) => k)).toEqual(['x', 'y']);
  });

  it('escapes keys in paths like JSON Pointer', () => {
    expect(joinPath('', 'a')).toBe('/a');
    expect(joinPath('/a', '0')).toBe('/a/0');
    expect(joinPath('', 'a/b')).toBe('/a~1b');
    expect(joinPath('/a~1b', '~x')).toBe('/a~1b/~0x');
  });

  it('formats primitives with their kind', () => {
    expect(formatPrimitive('x')).toEqual({ text: '"x"', kind: 'string' });
    expect(formatPrimitive(3.5)).toEqual({ text: '3.5', kind: 'number' });
    expect(formatPrimitive(true)).toEqual({ text: 'true', kind: 'boolean' });
    expect(formatPrimitive(null)).toEqual({ text: 'null', kind: 'null' });
  });

  it('finds keys and values case-insensitively and lists ancestors to expand', () => {
    const result = findMatches(SAMPLE, '김치');
    expect([...result.matches].sort()).toEqual(['/ingredients/0/item', '/steps/0']);
    expect(result.expand.has('')).toBe(true);
    expect(result.expand.has('/ingredients')).toBe(true);
    expect(result.expand.has('/ingredients/0')).toBe(true);
    expect(result.expand.has('/steps')).toBe(true);
    expect(result.total).toBe(2);

    const byKey = findMatches(SAMPLE, 'SERV');
    expect([...byKey.matches]).toEqual(['/servings']);
    expect(findMatches(SAMPLE, '   ').total).toBe(0);
    expect(findMatches(SAMPLE, 'null').matches.has('/note')).toBe(true);
  });

  it('stops at the match limit and reports truncation', () => {
    const big = Array.from({ length: 1000 }, (_, i) => `x${i}`);
    const result = findMatches(big, 'x', 50);
    expect(result.matches.size).toBe(50);
    expect(result.truncated).toBe(true);
  });

  it('describes parse errors with line and column when available', () => {
    const text = '{\n  "a": 1,\n  "b": }';
    let message = '';
    try {
      JSON.parse(text);
    } catch (error) {
      message = describeJsonError(error, text);
    }
    expect(message).toMatch(/JSON/);
    if (/position/.test(message)) expect(message).toMatch(/3행/);
  });
});
