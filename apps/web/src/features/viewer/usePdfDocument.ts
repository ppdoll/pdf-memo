import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { loadPdfjs } from './pdf/loadPdfjs';

export type PdfLoadState =
  | { status: 'loading' }
  | { status: 'ready'; pdf: PDFDocumentProxy }
  | { status: 'error'; message: string };

/** Blob → pdf.js 문서. blob이 바뀌거나 언마운트되면 이전 문서를 파기한다 */
export function usePdfDocument(blob: Blob | null | undefined): PdfLoadState {
  const [state, setState] = useState<PdfLoadState>({ status: 'loading' });

  useEffect(() => {
    setState({ status: 'loading' });
    if (!blob) return;

    let cancelled = false;
    let task: PDFDocumentLoadingTask | undefined;

    (async () => {
      const pdfjs = await loadPdfjs();
      const data = new Uint8Array(await blob.arrayBuffer());
      if (cancelled) return;
      task = pdfjs.getDocument({ data });
      const pdf = await task.promise;
      if (cancelled) {
        await pdf.destroy();
        return;
      }
      setState({ status: 'ready', pdf });
    })().catch((error: unknown) => {
      if (cancelled) return;
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    });

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blob]);

  return state;
}
