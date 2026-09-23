import type { InkTool } from '@pdf-memo/shared';
import { create } from 'zustand';
import type { Storage } from '../../storage/ports';
import { RECENT_STICKERS_MAX, type StickerRef } from '../sticker/model';
import type { ShapeDefaults } from '../shape/model';
import type { TextAlign, TextDefaults } from '../text/model';

export type Tool = InkTool | 'eraser' | 'hand' | 'text' | 'note' | 'sticker' | 'shape';

export interface InkSettings {
  color: string;
  width: number;
}

export interface NoteDefaults {
  color: string;
}

export interface StickerSettings {
  /** 지금 붙일 스티커. null이면 탭해도 아무것도 붙지 않는다 */
  active: StickerRef | null;
  /** 최근 사용, 앞이 최신 */
  recent: StickerRef[];
}

export interface ToolSnapshot {
  tool: Tool;
  pen: InkSettings;
  highlighter: InkSettings;
  marker: InkSettings;
  eraserRadius: number;
  /** 손가락으로도 그리기 (기본은 손가락 = 스크롤·확대) */
  fingerDraws: boolean;
  /** 새 텍스트 상자의 서식 */
  text: TextDefaults;
  /** 새 스티키 노트의 색 */
  note: NoteDefaults;
  sticker: StickerSettings;
  shape: ShapeDefaults;
}

interface ToolState extends ToolSnapshot {
  setTool(tool: Tool): void;
  setInk(tool: InkTool, patch: Partial<InkSettings>): void;
  setEraserRadius(radius: number): void;
  setFingerDraws(value: boolean): void;
  setText(patch: Partial<TextDefaults>): void;
  setNote(patch: Partial<NoteDefaults>): void;
  /** 붙일 스티커를 고른다. 고르면 최근 목록 맨 앞에 넣는다 */
  setSticker(ref: StickerRef | null): void;
  setShape(patch: Partial<ShapeDefaults>): void;
  hydrate(snapshot: Partial<ToolSnapshot>): void;
}

export const DEFAULT_TOOLS: ToolSnapshot = {
  tool: 'pen',
  pen: { color: '#1f2937', width: 2 },
  highlighter: { color: '#fde047', width: 12 },
  marker: { color: '#ef4444', width: 6 },
  eraserRadius: 8,
  fingerDraws: false,
  text: { color: '#1f2937', fontSize: 14, background: null, align: 'left' },
  note: { color: '#fde047' },
  sticker: { active: null, recent: [] },
  shape: { kind: 'rect', stroke: '#ef4444', strokeWidth: 2, fill: null, dashed: false },
};

export const INK_COLORS: Record<InkTool, string[]> = {
  pen: ['#1f2937', '#ef4444', '#f97316', '#16a34a', '#2563eb', '#7c3aed', '#db2777', '#78716c'],
  highlighter: ['#fde047', '#86efac', '#93c5fd', '#f9a8d4', '#fdba74', '#c4b5fd'],
  marker: ['#ef4444', '#f97316', '#2563eb', '#16a34a', '#1f2937', '#db2777'],
};

/** pt 단위 굵기 프리셋 */
export const INK_WIDTHS: Record<InkTool, number[]> = {
  pen: [1, 2, 3.5, 5],
  highlighter: [8, 12, 18, 24],
  marker: [3, 6, 10, 14],
};

export const ERASER_RADII = [4, 8, 16];

const TOOLS: Tool[] = [
  'pen',
  'highlighter',
  'marker',
  'eraser',
  'hand',
  'text',
  'note',
  'sticker',
  'shape',
];
const SHAPE_KIND_VALUES: ShapeDefaults['kind'][] = ['rect', 'ellipse', 'line', 'arrow'];
const ALIGNS: TextAlign[] = ['left', 'center', 'right'];
const HEX = /^#[0-9a-fA-F]{6}$/;

export function isInkTool(tool: Tool): tool is InkTool {
  return tool === 'pen' || tool === 'highlighter' || tool === 'marker';
}

const isHex = (value: unknown): value is string => typeof value === 'string' && HEX.test(value);

function sanitizeInk(value: unknown, fallback: InkSettings): InkSettings {
  if (typeof value !== 'object' || value === null) return fallback;
  const v = value as Partial<InkSettings>;
  return {
    color: isHex(v.color) ? v.color : fallback.color,
    width: typeof v.width === 'number' && v.width > 0 && v.width <= 64 ? v.width : fallback.width,
  };
}

function sanitizeText(value: unknown, fallback: TextDefaults): TextDefaults {
  if (typeof value !== 'object' || value === null) return fallback;
  const v = value as Partial<TextDefaults>;
  return {
    color: isHex(v.color) ? v.color : fallback.color,
    fontSize:
      typeof v.fontSize === 'number' && v.fontSize >= 6 && v.fontSize <= 96
        ? v.fontSize
        : fallback.fontSize,
    background: v.background === null || isHex(v.background) ? v.background : fallback.background,
    align: v.align && ALIGNS.includes(v.align) ? v.align : fallback.align,
  };
}

function sanitizeNote(value: unknown, fallback: NoteDefaults): NoteDefaults {
  if (typeof value !== 'object' || value === null) return fallback;
  const v = value as Partial<NoteDefaults>;
  return { color: isHex(v.color) ? v.color : fallback.color };
}

function sanitizeStickerRef(value: unknown): StickerRef | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Partial<StickerRef>;
  if (typeof v.assetId !== 'string' || v.assetId.length === 0) return null;
  if (typeof v.width !== 'number' || !(v.width > 0)) return null;
  if (typeof v.height !== 'number' || !(v.height > 0)) return null;
  return { assetId: v.assetId, width: v.width, height: v.height };
}

function sanitizeSticker(value: unknown, fallback: StickerSettings): StickerSettings {
  if (typeof value !== 'object' || value === null) return fallback;
  const v = value as Partial<StickerSettings>;
  const recent = Array.isArray(v.recent)
    ? v.recent
        .map(sanitizeStickerRef)
        .filter((ref): ref is StickerRef => ref !== null)
        .slice(0, RECENT_STICKERS_MAX)
    : fallback.recent;
  return { active: sanitizeStickerRef(v.active), recent };
}

function sanitizeShape(value: unknown, fallback: ShapeDefaults): ShapeDefaults {
  if (typeof value !== 'object' || value === null) return fallback;
  const v = value as Partial<ShapeDefaults>;
  return {
    kind: v.kind && SHAPE_KIND_VALUES.includes(v.kind) ? v.kind : fallback.kind,
    stroke: isHex(v.stroke) ? v.stroke : fallback.stroke,
    strokeWidth:
      typeof v.strokeWidth === 'number' && v.strokeWidth > 0 && v.strokeWidth <= 64
        ? v.strokeWidth
        : fallback.strokeWidth,
    fill: v.fill === null || isHex(v.fill) ? v.fill : fallback.fill,
    dashed: typeof v.dashed === 'boolean' ? v.dashed : fallback.dashed,
  };
}

/** 저장된 설정을 검증해 상태로 바꾼다 (손상된 값은 기본값으로) */
export function sanitizeSnapshot(input: Partial<ToolSnapshot>): ToolSnapshot {
  return {
    tool: input.tool && TOOLS.includes(input.tool) ? input.tool : DEFAULT_TOOLS.tool,
    pen: sanitizeInk(input.pen, DEFAULT_TOOLS.pen),
    highlighter: sanitizeInk(input.highlighter, DEFAULT_TOOLS.highlighter),
    marker: sanitizeInk(input.marker, DEFAULT_TOOLS.marker),
    eraserRadius:
      typeof input.eraserRadius === 'number' && input.eraserRadius > 0
        ? input.eraserRadius
        : DEFAULT_TOOLS.eraserRadius,
    fingerDraws:
      typeof input.fingerDraws === 'boolean' ? input.fingerDraws : DEFAULT_TOOLS.fingerDraws,
    text: sanitizeText(input.text, DEFAULT_TOOLS.text),
    note: sanitizeNote(input.note, DEFAULT_TOOLS.note),
    sticker: sanitizeSticker(input.sticker, DEFAULT_TOOLS.sticker),
    shape: sanitizeShape(input.shape, DEFAULT_TOOLS.shape),
  };
}

export const useToolStore = create<ToolState>()((set) => ({
  ...DEFAULT_TOOLS,
  setTool: (tool) => set({ tool }),
  setInk: (tool, patch) =>
    set((state) => {
      const next = { ...state[tool], ...patch };
      if (tool === 'pen') return { pen: next };
      if (tool === 'highlighter') return { highlighter: next };
      return { marker: next };
    }),
  setEraserRadius: (eraserRadius) => set({ eraserRadius }),
  setFingerDraws: (fingerDraws) => set({ fingerDraws }),
  setText: (patch) => set((state) => ({ text: { ...state.text, ...patch } })),
  setNote: (patch) => set((state) => ({ note: { ...state.note, ...patch } })),
  setSticker: (ref) =>
    set((state) => {
      if (!ref) return { sticker: { ...state.sticker, active: null } };
      const recent = [ref, ...state.sticker.recent.filter((r) => r.assetId !== ref.assetId)].slice(
        0,
        RECENT_STICKERS_MAX,
      );
      return { sticker: { active: ref, recent } };
    }),
  setShape: (patch) => set((state) => ({ shape: { ...state.shape, ...patch } })),
  hydrate: (snapshot) => set(sanitizeSnapshot(snapshot)),
}));

export function toolSnapshot(state: ToolSnapshot): ToolSnapshot {
  return {
    tool: state.tool,
    pen: state.pen,
    highlighter: state.highlighter,
    marker: state.marker,
    eraserRadius: state.eraserRadius,
    fingerDraws: state.fingerDraws,
    text: state.text,
    note: state.note,
    sticker: state.sticker,
    shape: state.shape,
  };
}

const SETTINGS_KEY = 'tools.v1';

export async function loadToolSettings(storage: Storage): Promise<void> {
  const saved = await storage.settings.get<Partial<ToolSnapshot>>(SETTINGS_KEY);
  if (saved) useToolStore.getState().hydrate(saved);
}

/** 도구 상태가 바뀌면 잠시 뒤 settings 테이블에 저장. 해제 함수를 돌려준다 */
export function persistToolSettings(storage: Storage): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsubscribe = useToolStore.subscribe((state) => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      void storage.settings.set(SETTINGS_KEY, toolSnapshot(state));
    }, 300);
  });
  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
