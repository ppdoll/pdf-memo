import * as fontkit from 'fontkit';
import type { PDFDocument } from 'pdf-lib';

type PdfLibFontkit = Parameters<PDFDocument['registerFontkit']>[0];
type Listener = (payload?: unknown) => void;

/**
 * pdf-lib 1.17은 fontkit 1.x API(font.cff, subset.encodeStream())를 기대하지만,
 * 구형 @pdf-lib/fontkit은 Pretendard처럼 FDArray에 FontMatrix가 있는 CID-keyed CFF를 못 읽는다
 * ("Unknown operator 3079"). 그래서 fontkit 2를 쓰고 달라진 부분만 얇게 맞춰 준다.
 */
export function createPdfFontkit(): PdfLibFontkit {
  const adapter = {
    create(buffer: Uint8Array) {
      const font = fontkit.create(buffer);
      if (!('cff' in font)) {
        Object.defineProperty(font, 'cff', { get: () => font['CFF '] });
      }
      const createSubset = font.createSubset.bind(font);
      font.createSubset = () => {
        const subset = createSubset();
        return Object.assign(subset, { encodeStream: () => streamOf(() => subset.encode()) });
      };
      return font;
    },
  };
  return adapter as unknown as PdfLibFontkit;
}

/** fontkit 1.x가 돌려주던 Node 스트림 흉내: data 한 번, 이어서 end (실패하면 error) */
function streamOf(produce: () => Uint8Array) {
  const listeners = new Map<string, Listener>();
  const stream = {
    on(event: string, listener: Listener) {
      listeners.set(event, listener);
      return stream;
    },
  };
  queueMicrotask(() => {
    try {
      const bytes = produce();
      listeners.get('data')?.(bytes);
      listeners.get('end')?.();
    } catch (error) {
      listeners.get('error')?.(error);
    }
  });
  return stream;
}
