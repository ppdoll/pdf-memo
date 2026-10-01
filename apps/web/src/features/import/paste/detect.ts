/** 붙여 넣은 글의 종류. JSON은 트리 문서로, 나머지는 A4 PDF로 만든다 */
export type PastedKind = 'json' | 'markdown' | 'text';

export const PASTE_MAX_CHARS = 1_000_000;
export const PASTE_TITLE_MAX = 80;

export const PASTED_KIND_LABEL: Record<PastedKind, string> = {
  json: 'JSON',
  markdown: '마크다운',
  text: '일반 글',
};

/** 한 줄만 있어도 마크다운으로 볼 만한 신호 */
const STRONG_MARKDOWN = [
  /^#{1,6}\s+\S/m, // 제목
  /^```/m, // 코드 블록
  /^\|.+\|\s*$/m, // 표
  /\[[^\]\n]+\]\([^)\n]+\)/, // 링크
  /^>\s?\S/m, // 인용
  /\*\*[^*\n]+\*\*/, // 굵게
];
const LIST_LINE = /^\s{0,3}(?:[-*+]|\d+[.)])\s+\S/gm;

/** 목록 줄이 둘 이상이거나 강한 신호가 하나라도 있으면 마크다운 */
export function looksLikeMarkdown(text: string): boolean {
  if (STRONG_MARKDOWN.some((re) => re.test(text))) return true;
  return (text.match(LIST_LINE)?.length ?? 0) >= 2;
}

/** JSON인지, 마크다운 문법이 있는지, 그냥 글인지 가늠한다 */
export function detectPastedKind(text: string): PastedKind {
  const trimmed = text.trim();
  if (trimmed.length === 0) return 'text';
  if (/^[[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      // JSON처럼 시작하지만 아니면 글로 본다
    }
  }
  return looksLikeMarkdown(trimmed) ? 'markdown' : 'text';
}

const pad = (n: number) => String(n).padStart(2, '0');

function fallbackTitle(what: string, now: Date): string {
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `붙여넣은 ${what} ${date} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

/** 마크다운이면 첫 제목, 아니면 첫 줄을 제목으로. JSON은 날짜·시간으로 */
export function titleFromPastedText(text: string, kind: PastedKind, now = new Date()): string {
  if (kind === 'json') return fallbackTitle('JSON', now);
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const heading = kind === 'markdown' ? lines.find((line) => /^#{1,6}\s+/.test(line)) : undefined;
  const raw = heading ?? lines[0];
  if (!raw) return fallbackTitle('글', now);
  const cleaned = raw
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(?:[-*+]|\d+[.)])\s+/, '')
    .replace(/^>\s?/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallbackTitle('글', now)).slice(0, PASTE_TITLE_MAX);
}

/** 기존 가져오기 큐가 그대로 처리할 수 있게 파일 객체로 만든다 (JSON → .json, 마크다운 → .md, 글 → .txt) */
export function pastedTextToFile(text: string, kind: PastedKind, title: string): File {
  const safe =
    title
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || '붙여넣기';
  const normalized = text.replace(/\r\n?/g, '\n');
  if (kind === 'json') return new File([normalized], `${safe}.json`, { type: 'application/json' });
  if (kind === 'markdown') return new File([normalized], `${safe}.md`, { type: 'text/markdown' });
  return new File([normalized], `${safe}.txt`, { type: 'text/plain' });
}

/** JSON으로 저장하기 전에 문법을 확인한다. 문제가 없으면 null */
export function jsonProblem(text: string): string | null {
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}
