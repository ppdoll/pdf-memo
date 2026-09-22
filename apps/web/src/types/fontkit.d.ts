/**
 * fontkit 2는 타입 정의를 싣지 않는다. PDF 임베드(pdf-lib 어댑터)에 쓰는 최소 표면만 선언한다.
 */
declare module 'fontkit' {
  export interface FontkitGlyph {
    id: number;
    advanceWidth: number;
    codePoints: number[];
  }

  export interface FontkitGlyphRun {
    glyphs: FontkitGlyph[];
  }

  export interface FontkitSubset {
    /** CFF 기반 폰트의 서브셋이면 원본 CFF 테이블. pdf-lib이 CIDFontType0 판정에 쓴다 */
    cff?: unknown;
    includeGlyph(glyph: number | { id: number }): number;
    /** 서브셋 폰트 바이트 (CFF면 bare CFF 테이블, TrueType이면 완전한 폰트) */
    encode(): Uint8Array;
  }

  export interface FontkitFont {
    postscriptName: string;
    numGlyphs: number;
    unitsPerEm: number;
    'CFF '?: unknown;
    layout(text: string, features?: string[] | Record<string, boolean>): FontkitGlyphRun;
    createSubset(): FontkitSubset;
  }

  export function create(buffer: Uint8Array, postscriptName?: string): FontkitFont;
}
