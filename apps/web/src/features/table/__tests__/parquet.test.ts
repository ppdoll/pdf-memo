import { parquetWriteBuffer } from 'hyparquet-writer';
import { describe, expect, it } from 'vitest';
import { hasParquetMagic } from '../../import/parquet/detect';
import { formatCell } from '../model';
import { openParquet } from '../parquet';

/** hyparquet-writer로 만든 작은 표 (snappy 압축, 행 그룹 2개) */
function sample(): ArrayBuffer {
  return parquetWriteBuffer({
    rowGroupSize: 2,
    columnData: [
      { name: 'id', data: [1, 2, 3, 4, 5], type: 'INT32' },
      { name: 'name', data: ['가', '나', null, '라', '마'], type: 'STRING', nullable: true },
      { name: 'score', data: [1.5, 2.5, 3.5, 4.5, 5.5], type: 'DOUBLE' },
      { name: 'ok', data: [true, false, true, false, true], type: 'BOOLEAN' },
      {
        name: 'when',
        data: [
          new Date('2026-01-01T00:00:00Z'),
          null,
          null,
          null,
          new Date('2026-01-05T09:30:00Z'),
        ],
        type: 'TIMESTAMP',
        nullable: true,
      },
    ],
  });
}

describe('openParquet', () => {
  it('reads metadata, column types and row ranges across row groups', async () => {
    const buffer = sample();
    expect(hasParquetMagic(new Uint8Array(buffer))).toBe(true);
    const table = await openParquet(buffer);
    expect(table.rowCount).toBe(5);
    expect(table.rowGroups).toBe(3);
    expect(table.columns).toEqual([
      { name: 'id', type: '정수', numeric: true },
      { name: 'name', type: '글', numeric: false },
      { name: 'score', type: '소수', numeric: true },
      { name: 'ok', type: '참/거짓', numeric: false },
      { name: 'when', type: '날짜시간', numeric: false },
    ]);

    const middle = await table.readRows(1, 4);
    expect(middle.map((r) => r.id)).toEqual([2, 3, 4]);
    expect(middle.map((r) => formatCell(r.name))).toEqual(['나', null, '라']);
    expect(formatCell(middle[0].when)).toBeNull();

    const tail = await table.readRows(4, 99);
    expect(tail).toHaveLength(1);
    expect(formatCell(tail[0].when)).toBe('2026-01-05T09:30:00Z');
    expect(await table.readRows(7, 9)).toEqual([]);
  });

  it('rejects data that is not parquet', async () => {
    const garbage = new TextEncoder().encode('PAR1 this is not really a parquet file PAR1').buffer;
    expect(hasParquetMagic(new Uint8Array(garbage))).toBe(true);
    await expect(openParquet(garbage as ArrayBuffer)).rejects.toThrow();
    expect(hasParquetMagic(new TextEncoder().encode('hello'))).toBe(false);
  });
});
