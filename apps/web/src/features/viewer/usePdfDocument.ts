import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, useState } from 'react';
import { passwordErrorKind } from '../import/encrypted/errors';
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
        // 가져올 때 암호를 풀어 저장하므로 보통 여기 오지 않는다 (그 전에 들어온 문서용 안내)
        message: passwordErrorKind(error)
          ? '암호가 걸린 PDF입니다. 문서를 다시 가져오면 암호를 풀 수 있습니다'
          : error instanceof Error
            ? error.message
            : String(error),
      });
    });

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [blob]);

  return state;
}
