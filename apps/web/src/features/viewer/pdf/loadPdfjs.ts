export type PdfjsModule = typeof import('pdfjs-dist');

let modulePromise: Promise<PdfjsModule> | undefined;

/**
 * pdf.js를 지연 로드한다. 라이브러리 화면은 pdf.js 없이 떠야 하므로 정적 import를 피한다.
 * 워커 파일은 Vite가 자산으로 내보내고 `?url`로 주소를 얻는다.
 */
export function loadPdfjs(): Promise<PdfjsModule> {
  modulePromise ??= (async () => {
    const [pdfjs, worker] = await Promise.all([
      import('pdfjs-dist'),
      import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    ]);
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    return pdfjs;
  })();
  return modulePromise;
}

/** pdf.js의 page.rotate(임의의 정수)를 0·90·180·270으로 정규화 */
export function normalizeRotation(degrees: number): 0 | 90 | 180 | 270 {
  const rounded = Math.round(degrees / 90) * 90;
  const normalized = ((rounded % 360) + 360) % 360;
  return normalized as 0 | 90 | 180 | 270;
}

export function isRenderingCancelled(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'RenderingCancelledException'
  );
}
