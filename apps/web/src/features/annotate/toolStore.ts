import type { InkTool } from '@pdf-memo/shared';
import { create } from 'zustand';
import type { Storage } from '../../storage/ports';

export type Tool = InkTool | 'eraser' | 'hand';

export interface InkSettings {
  color: string;
  width: number;
}

export interface ToolSnapshot {
  tool: Tool;
  pen: InkSettings;
  highlighter: InkSettings;
  marker: InkSettings;
  eraserRadius: number;
  /** 손가락으로도 그리기 (기본은 손가락 = 스크롤·확대) */
  fingerDraws: boolean;
}

interface ToolState extends ToolSnapshot {
  setTool(tool: Tool): void;
  setInk(tool: InkTool, patch: Partial<InkSettings>): void;
  setEraserRadius(radius: number): void;
  setFingerDraws(value: boolean): void;
  hydrate(snapshot: Partial<ToolSnapshot>): void;
}

export const DEFAULT_TOOLS: ToolSnapshot = {
  tool: 'pen',
  pen: { color: '#1f2937', width: 2 },
  highlighter: { color: '#fde047', width: 12 },
  marker: { color: '#ef4444', width: 6 },
  eraserRadius: 8,
  fingerDraws: false,
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

const TOOLS: Tool[] = ['pen', 'highlighter', 'marker', 'eraser', 'hand'];
const HEX = /^#[0-9a-fA-F]{6}$/;

export function isInkTool(tool: Tool): tool is InkTool {
  return tool === 'pen' || tool === 'highlighter' || tool === 'marker';
}

function sanitizeInk(value: unknown, fallback: InkSettings): InkSettings {
  if (typeof value !== 'object' || value === null) return fallback;
  const v = value as Partial<InkSettings>;
  return {
    color: typeof v.color === 'string' && HEX.test(v.color) ? v.color : fallback.color,
    width: typeof v.width === 'number' && v.width > 0 && v.width <= 64 ? v.width : fallback.width,
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
