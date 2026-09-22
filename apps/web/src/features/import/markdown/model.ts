/**
 * 마크다운 → PDF 변환에 쓰는 문서 모델. marked 토큰을 이 모양으로 정리한 뒤(parse.ts)
 * 조판(layout.ts)과 그리기(render.ts)가 이 모델만 본다.
 */

export type Align = 'left' | 'center' | 'right' | null;

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  /** 절대 URL이면 PDF 링크 주석도 만든다 */
  link?: string;
}

export interface ListItem {
  runs: InlineRun[];
  /** null = 일반 항목, true/false = 체크박스 */
  checked: boolean | null;
  /** 중첩 목록·코드 블록 등 */
  children: Block[];
}

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export type Block =
  | { kind: 'heading'; level: HeadingLevel; runs: InlineRun[] }
  | { kind: 'paragraph'; runs: InlineRun[] }
  | { kind: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { kind: 'code'; text: string; lang: string | null }
  | { kind: 'quote'; blocks: Block[] }
  | { kind: 'table'; header: InlineRun[][]; rows: InlineRun[][][]; align: Align[] }
  | { kind: 'hr' }
  | { kind: 'image'; src: string; alt: string };

export interface MarkdownDoc {
  /** 첫 1단계 제목 (없으면 null) */
  title: string | null;
  blocks: Block[];
}

/** 런 목록을 평문으로 (제목·대체 텍스트용) */
export function plainText(runs: readonly InlineRun[]): string {
  return runs
    .map((r) => r.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 문서 안의 모든 이미지 src (중복 제거, 순서 유지) */
export function collectImageSources(blocks: readonly Block[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (list: readonly Block[]) => {
    for (const block of list) {
      if (block.kind === 'image' && !seen.has(block.src)) {
        seen.add(block.src);
        out.push(block.src);
      } else if (block.kind === 'quote') {
        visit(block.blocks);
      } else if (block.kind === 'list') {
        for (const item of block.items) visit(item.children);
      }
    }
  };
  visit(blocks);
  return out;
}
