/** Parquet 파일 판별. 표 뷰어로 열고, 바이트는 그대로 저장한다 */

export const MAX_PARQUET_BYTES = 200 * 1024 * 1024;
export const PARQUET_MIME = 'application/vnd.apache.parquet';

const PARQUET_MIME_PATTERN = /^application\/(vnd\.apache\.parquet|x-parquet|parquet)$/i;

export function isParquetFile(file: File): boolean {
  return PARQUET_MIME_PATTERN.test(file.type) || /\.parquet$/i.test(file.name);
}

export function titleFromParquetFileName(name: string): string {
  const title = name
    .trim()
    .replace(/\.parquet$/i, '')
    .trim();
  return title.length > 0 ? title.slice(0, 300) : '제목 없음';
}

/** 파일 앞뒤의 "PAR1" 매직을 확인한다 */
export function hasParquetMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const magic = (at: number) =>
    bytes[at] === 0x50 &&
    bytes[at + 1] === 0x41 &&
    bytes[at + 2] === 0x52 &&
    bytes[at + 3] === 0x31;
  return magic(0) && magic(bytes.length - 4);
}
