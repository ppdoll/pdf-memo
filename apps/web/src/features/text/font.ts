import fontUrl from 'pretendard/dist/public/static/Pretendard-Regular.otf?url';
import boldFontUrl from 'pretendard/dist/public/static/Pretendard-Bold.otf?url';
import { TEXT_FONT_FAMILY } from './model';
import type { Measure } from './wrap';

/**
 * Pretendard Regular (OFL-1.1). 화면 표시와 PDF 임베드에 같은 파일을 써서 줄바꿈이 일치한다.
 * 필요할 때만 불러오며(약 1.5MB), 서비스워커가 런타임 캐시로 보관한다.
 */
export const TEXT_FONT_URL: string = fontUrl;
export const TEXT_FONT_BOLD_URL: string = boldFontUrl;

let facePromise: Promise<boolean> | undefined;

/** 브라우저에 폰트를 등록한다. 지원하지 않는 환경이면 false */
export function ensureTextFont(): Promise<boolean> {
  facePromise ??= (async () => {
    if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) {
      return false;
    }
    try {
      const face = new FontFace(TEXT_FONT_FAMILY, `url(${fontUrl}) format('opentype')`, {
        display: 'swap',
      });
      await face.load();
      document.fonts.add(face);
      return true;
    } catch (error) {
      console.warn('[text] font load failed', error);
      return false;
    }
  })();
  return facePromise;
}

/** 캔버스 measureText 기반 폭 측정 (pt 단위: 배율 1에서 px = pt) */
export function createTextMeasurer(fontSize: number): Measure {
  if (typeof document === 'undefined') return (s) => [...s].length * fontSize * 0.55;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return (s) => [...s].length * fontSize * 0.55;
  ctx.font = `${fontSize}px "${TEXT_FONT_FAMILY}", system-ui, sans-serif`;
  return (s) => ctx.measureText(s).width;
}

function fetchFontBytes(url: string, label: string): Promise<Uint8Array> {
  return fetch(url)
    .then((response) => {
      if (!response.ok) throw new Error(`${label}을 불러올 수 없습니다`);
      return response.arrayBuffer();
    })
    .then((buffer) => new Uint8Array(buffer));
}

let bytesPromise: Promise<Uint8Array> | undefined;
let boldBytesPromise: Promise<Uint8Array> | undefined;

/** PDF 임베드용 원본 바이트 */
export function loadTextFontBytes(): Promise<Uint8Array> {
  bytesPromise ??= fetchFontBytes(fontUrl, '텍스트 폰트').catch((error: unknown) => {
    bytesPromise = undefined;
    throw error;
  });
  return bytesPromise;
}

/** 굵은 글꼴 바이트 (마크다운 → PDF의 제목·강조용). 필요할 때만 받는다 */
export function loadTextFontBoldBytes(): Promise<Uint8Array> {
  boldBytesPromise ??= fetchFontBytes(boldFontUrl, '굵은 글꼴').catch((error: unknown) => {
    boldBytesPromise = undefined;
    throw error;
  });
  return boldBytesPromise;
}
