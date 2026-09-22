/** JSON 파일 판별. JSON은 PDF로 바꾸지 않고 그대로 저장해 트리 뷰어로 연다 */

export const MAX_JSON_BYTES = 5 * 1024 * 1024;

export function isJsonFile(file: File): boolean {
  return /^application\/(json|ld\+json)$/i.test(file.type) || /\.(json|jsonl)$/i.test(file.name);
}

export function titleFromJsonFileName(name: string): string {
  const title = name
    .trim()
    .replace(/\.(json|jsonl)$/i, '')
    .trim();
  return title.length > 0 ? title.slice(0, 300) : '제목 없음';
}
