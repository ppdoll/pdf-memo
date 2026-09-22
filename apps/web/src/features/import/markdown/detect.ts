/** 가벼운 판별 함수만 둔다. 변환기 자체(marked·pdf-lib·fontkit)는 필요할 때 동적으로 불러온다 */

const MARKDOWN_EXT = /\.(md|markdown|mdown|txt)$/i;

export function isMarkdownFile(file: File): boolean {
  if (MARKDOWN_EXT.test(file.name)) return true;
  return file.type === 'text/markdown';
}

export function titleFromMarkdownFileName(name: string): string {
  const title = name.trim().replace(MARKDOWN_EXT, '').trim();
  return title.length > 0 ? title.slice(0, 300) : '제목 없음';
}
