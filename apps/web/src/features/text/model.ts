import {
  ANNOTATION_SCHEMA_VERSION,
  createEntityBase,
  type BBox,
  type NoteObject,
  type PageSize,
  type TextObject,
} from '@pdf-memo/shared';

/** 텍스트 객체는 화면(HTML)과 내보내기(pdf-lib)에서 같은 폰트를 써야 줄바꿈이 일치한다 */
export const TEXT_FONT_FAMILY = 'Pretendard';
/** pt 단위 안쪽 여백 */
export const TEXT_PADDING = 4;
/** fontSize 배수 */
export const TEXT_LINE_HEIGHT = 1.3;
export const TEXT_DEFAULT_WIDTH = 200;
export const TEXT_MIN_WIDTH = 40;
export const FONT_SIZES = [10, 12, 14, 18, 24];
export const TEXT_BACKGROUNDS: Array<{ label: string; value: string | null }> = [
  { label: '없음', value: null },
  { label: '노랑', value: '#fef08a' },
  { label: '흰색', value: '#ffffff' },
];

/** 스티키 노트 아이콘 크기 (pt) */
export const NOTE_SIZE = 24;
export const NOTE_EXPANDED_WIDTH = 160;
export const NOTE_COLORS = ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74'];

export type TextAlign = TextObject['align'];

export interface TextDefaults {
  color: string;
  fontSize: number;
  background: string | null;
  align: TextAlign;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), Math.max(min, max));

export function minTextHeight(fontSize: number, lines = 1): number {
  return Math.ceil(lines * fontSize * TEXT_LINE_HEIGHT + TEXT_PADDING * 2);
}

export function textBBox(t: Pick<TextObject, 'x' | 'y' | 'w' | 'h'>): BBox {
  return [t.x, t.y, t.w, t.h];
}

export function noteBBox(n: Pick<NoteObject, 'x' | 'y'>): BBox {
  return [n.x, n.y, NOTE_SIZE, NOTE_SIZE];
}

/** 페이지 공간의 한 점에 기본 크기의 텍스트 상자를 만든다 (내용은 비어 있음, 커밋 전 초안) */
export function createTextObject(
  documentId: string,
  pageIndex: number,
  z: number,
  at: { x: number; y: number },
  pageSize: PageSize,
  defaults: TextDefaults,
): TextObject {
  const w = clamp(TEXT_DEFAULT_WIDTH, TEXT_MIN_WIDTH, Math.max(TEXT_MIN_WIDTH, pageSize.w - 8));
  const h = minTextHeight(defaults.fontSize);
  const x = clamp(at.x, 0, pageSize.w - w);
  const y = clamp(at.y, 0, pageSize.h - h);
  return {
    ...createEntityBase(),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    documentId,
    pageIndex,
    z,
    bbox: [x, y, w, h],
    locked: false,
    type: 'text',
    x,
    y,
    w,
    h,
    rotation: 0,
    content: '',
    fontFamily: TEXT_FONT_FAMILY,
    fontSize: defaults.fontSize,
    color: defaults.color,
    align: defaults.align,
    background: defaults.background,
  };
}

export function createNoteObject(
  documentId: string,
  pageIndex: number,
  z: number,
  at: { x: number; y: number },
  pageSize: PageSize,
  color: string,
): NoteObject {
  const x = clamp(at.x - NOTE_SIZE / 2, 0, pageSize.w - NOTE_SIZE);
  const y = clamp(at.y - NOTE_SIZE / 2, 0, pageSize.h - NOTE_SIZE);
  return {
    ...createEntityBase(),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    documentId,
    pageIndex,
    z,
    bbox: [x, y, NOTE_SIZE, NOTE_SIZE],
    locked: false,
    type: 'note',
    x,
    y,
    content: '',
    color,
    collapsed: false,
  };
}

/** 위치·크기를 바꾸면서 bbox를 함께 맞춘다 */
export function withTextGeometry(
  text: TextObject,
  patch: Partial<Pick<TextObject, 'x' | 'y' | 'w' | 'h'>>,
  pageSize: PageSize,
): TextObject {
  const w = clamp(patch.w ?? text.w, TEXT_MIN_WIDTH, pageSize.w);
  const h = Math.max(patch.h ?? text.h, minTextHeight(text.fontSize));
  const x = clamp(patch.x ?? text.x, 0, pageSize.w - w);
  const y = clamp(patch.y ?? text.y, 0, pageSize.h - Math.min(h, pageSize.h));
  return { ...text, x, y, w, h, bbox: [x, y, w, h] };
}

export function withNotePosition(
  note: NoteObject,
  at: { x: number; y: number },
  pageSize: PageSize,
): NoteObject {
  const x = clamp(at.x, 0, pageSize.w - NOTE_SIZE);
  const y = clamp(at.y, 0, pageSize.h - NOTE_SIZE);
  return { ...note, x, y, bbox: [x, y, NOTE_SIZE, NOTE_SIZE] };
}
