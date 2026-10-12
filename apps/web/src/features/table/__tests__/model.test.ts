import { describe, expect, it } from 'vitest';
import {
  clipCell,
  filterRows,
  formatCell,
  nextSort,
  pageCount,
  sortRows,
  toCsv,
  type Row,
  type TableColumn,
} from '../model';

const columns: TableColumn[] = [
  { name: 'id', type: '정수', numeric: true },
  { name: 'name', type: '글', numeric: false },
  { name: 'when', type: '날짜시간', numeric: false },
];

const rows: Row[] = [
  { id: 2n, name: '나, 둘째', when: new Date('2026-02-01T00:00:00Z') },
  { id: 1n, name: '가', when: new Date('2026-01-01T10:30:00Z') },
  { id: 3n, name: null, when: null },
];

describe('formatCell', () => {
  it('renders primitives, bigints, dates, bytes and nested values', () => {
    expect(formatCell(null)).toBeNull();
    expect(formatCell(undefined)).toBeNull();
    expect(formatCell('글')).toBe('글');
    expect(formatCell(1.5)).toBe('1.5');
    expect(formatCell(1099511628074n)).toBe('1099511628074');
    expect(formatCell(true)).toBe('true');
    expect(formatCell(new Date('2026-01-01T00:00:00Z'))).toBe('2026-01-01');
    expect(formatCell(new Date('2026-01-01T10:30:00Z'))).toBe('2026-01-01T10:30:00Z');
    expect(formatCell(new Uint8Array(5))).toBe('<5 bytes>');
    expect(formatCell(['a', 1n])).toBe('["a","1"]');
    expect(formatCell({ x: 1n, y: 'z' })).toBe('{"x":"1","y":"z"}');
  });

  it('clips long text for display', () => {
    expect(clipCell('x'.repeat(10), 4)).toBe('xxxx…');
    expect(clipCell('short', 10)).toBe('short');
  });
});

describe('filterRows', () => {
  it('matches any cell case-insensitively and returns everything for a blank query', () => {
    expect(filterRows(rows, columns, '  ')).toHaveLength(3);
    expect(filterRows(rows, columns, '둘째').map((r) => r.id)).toEqual([2n]);
    expect(filterRows(rows, columns, '2026-01').map((r) => r.id)).toEqual([1n]);
    expect(filterRows(rows, columns, 'none')).toHaveLength(0);
  });
});

describe('sortRows / nextSort', () => {
  it('sorts numbers, strings and dates, keeping nulls last in both directions', () => {
    expect(sortRows(rows, { column: 'id', direction: 'asc' }).map((r) => r.id)).toEqual([
      1n,
      2n,
      3n,
    ]);
    expect(sortRows(rows, { column: 'name', direction: 'desc' }).map((r) => r.name)).toEqual([
      '나, 둘째',
      '가',
      null,
    ]);
    expect(sortRows(rows, { column: 'when', direction: 'asc' }).map((r) => r.id)).toEqual([
      1n,
      2n,
      3n,
    ]);
    expect(sortRows(rows, { column: 'when', direction: 'desc' }).map((r) => r.id)).toEqual([
      2n,
      1n,
      3n,
    ]);
    expect(sortRows(rows, null).map((r) => r.id)).toEqual([2n, 1n, 3n]);
  });

  it('cycles none → asc → desc → none per column', () => {
    const asc = nextSort(null, 'id');
    expect(asc).toEqual({ column: 'id', direction: 'asc' });
    const desc = nextSort(asc, 'id');
    expect(desc).toEqual({ column: 'id', direction: 'desc' });
    expect(nextSort(desc, 'id')).toBeNull();
    expect(nextSort(desc, 'name')).toEqual({ column: 'name', direction: 'asc' });
  });
});

describe('toCsv / pageCount', () => {
  it('writes a header, escapes commas and quotes, and leaves nulls empty', () => {
    const csv = toCsv(columns, rows.slice(0, 1).concat({ id: 4n, name: 'say "hi"', when: null }));
    expect(csv).toBe('id,name,when\r\n2,"나, 둘째",2026-02-01\r\n4,"say ""hi""",\r\n');
  });

  it('counts pages with at least one page', () => {
    expect(pageCount(0)).toBe(1);
    expect(pageCount(200)).toBe(1);
    expect(pageCount(201)).toBe(2);
    expect(pageCount(1000, 300)).toBe(4);
  });
});
