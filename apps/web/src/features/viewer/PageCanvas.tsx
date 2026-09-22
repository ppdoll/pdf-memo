import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { useEffect, useRef, useState } from 'react';
import { isRenderingCancelled } from './pdf/loadPdfjs';
import type { PageBox } from './layout';

interface PageCanvasProps {
  pdf: PDFDocumentProxy;
  pageIndex: number;
  scale: number;
  rotation: number;
  box: PageBox;
}

const MAX_DPR = 3;

/**
 * 페이지 한 장. 배율이 바뀌면 다시 그리고, 진행 중인 렌더는 취소한다.
 * 다음 조각에서 이 위에 주석 캔버스 레이어가 올라간다.
 */
export function PageCanvas({ pdf, pageIndex, scale, rotation, box }: PageCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let renderTask: RenderTask | undefined;
    setRendered(false);

    (async () => {
      const page = await pdf.getPage(pageIndex + 1);
      if (cancelled) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const viewport = page.getViewport({ scale: scale * dpr, rotation });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      renderTask = page.render({ canvas, viewport });
      await renderTask.promise;
      if (!cancelled) setRendered(true);
    })().catch((error: unknown) => {
      if (cancelled || isRenderingCancelled(error)) return;
      console.error(`[PageCanvas] page ${pageIndex + 1}`, error);
    });

    return () => {
      cancelled = true;
      renderTask?.cancel();
    };
  }, [pdf, pageIndex, scale, rotation]);

  return (
    <div
      className="absolute bg-white shadow-md"
      style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
      data-page-index={pageIndex}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
      {!rendered && <div className="absolute inset-0 animate-pulse bg-slate-100" aria-hidden />}
    </div>
  );
}
