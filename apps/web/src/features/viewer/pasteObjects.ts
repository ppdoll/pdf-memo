import type { PageSize, TextObject } from '@pdf-memo/shared';
import {
  TEXT_PADDING,
  clamp,
  createTextObject,
  minTextHeight,
  type TextDefaults,
} from '../text/model';
import { wrapText, type Measure } from '../text/wrap';

/** 페이지에 붙여 넣는 글의 길이 상한 (그보다 길면 잘라 붙인다) */
export const PASTE_TEXT_MAX_CHARS = 20_000;
/** 붙여 넣은 글 상자의 폭은 페이지 폭의 이 비율을 넘지 않는다 */
const MAX_WIDTH_RATIO = 0.8;
const MIN_WIDTH = 120;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** 줄바꿈을 통일하고 빈 줄 연속을 줄인 뒤 앞뒤 공백을 뗀다 */
export function normalizePastedText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, PASTE_TEXT_MAX_CHARS);
}

/**
 * 붙여 넣은 글을 페이지 가운데 텍스트 상자로 만든다.
 * 폭은 가장 긴 줄에 맞추되 페이지 폭의 80% 이하, 높이는 화면과 같은 줄바꿈 계산으로 정한다.
 * 글이 비어 있으면 null.
 */
export function createPastedTextObject(
  documentId: string,
  pageIndex: number,
  z: number,
  text: string,
  pageSize: PageSize,
  defaults: TextDefaults,
  measure: Measure,
): TextObject | null {
  const content = normalizePastedText(text);
  if (content.length === 0) return null;
  const maxWidth = Math.max(MIN_WIDTH, Math.min(pageSize.w, pageSize.w * MAX_WIDTH_RATIO));
  const longest = content.split('\n').reduce((max, line) => Math.max(max, measure(line)), 0);
  const w = round2(clamp(Math.ceil(longest + TEXT_PADDING * 2 + 2), MIN_WIDTH, maxWidth));
  const lines = wrapText(content, w - TEXT_PADDING * 2, measure).length;
  const h = round2(Math.min(minTextHeight(defaults.fontSize, lines), pageSize.h));
  const x = round2(clamp((pageSize.w - w) / 2, 0, Math.max(0, pageSize.w - w)));
  const y = round2(clamp((pageSize.h - h) / 2, 0, Math.max(0, pageSize.h - h)));
  const base = createTextObject(documentId, pageIndex, z, { x, y }, pageSize, defaults);
  return { ...base, content, x, y, w, h, bbox: [x, y, w, h] };
}
