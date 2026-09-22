import { ROOT_FOLDER_ID, type PdfDocument } from '@pdf-memo/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { storage } from '../../storage';
import { libraryService } from '../library/service';
import { stepZoom } from './layout';
import { PdfViewer, type PdfViewerHandle, type ZoomSetting } from './PdfViewer';
import { usePdfDocument } from './usePdfDocument';
import { ViewerToolbar } from './ViewerToolbar';

export function DocumentPage() {
  const { documentId = '' } = useParams<{ documentId: string }>();
  const [doc, setDoc] = useState<PdfDocument | null | undefined>(undefined);
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(undefined);
    setBlob(null);
    (async () => {
      const found = await storage.documents.get(documentId);
      if (cancelled) return;
      if (!found || found.deletedAt !== null) {
        setDoc(null);
        return;
      }
      setDoc(found);
      void libraryService.markOpened(found.id);
      const bytes = await storage.blobs.get(found.blobHash);
      if (!cancelled) setBlob(bytes ?? null);
    })().catch((error: unknown) => console.error('[DocumentPage]', error));
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    if (doc) document.title = `${doc.title} · PDF MEMO`;
    return () => {
      document.title = 'PDF MEMO';
    };
  }, [doc]);

  if (doc === undefined) return <ViewerMessage>문서를 불러오는 중…</ViewerMessage>;
  if (doc === null) {
    return (
      <ViewerMessage>
        문서를 찾을 수 없습니다.{' '}
        <Link to="/" className="text-indigo-600 hover:underline">
          라이브러리로
        </Link>
      </ViewerMessage>
    );
  }
  return <DocumentViewer doc={doc} blob={blob} />;
}

function DocumentViewer({ doc, blob }: { doc: PdfDocument; blob: Blob | null }) {
  const pdfState = usePdfDocument(blob);
  const viewerRef = useRef<PdfViewerHandle>(null);
  const [zoom, setZoom] = useState<ZoomSetting>({ mode: 'fit-width' });
  const [effectiveScale, setEffectiveScale] = useState(1);
  const [currentPage, setCurrentPage] = useState(doc.lastViewedPage);

  // 마지막으로 본 페이지를 잠시 뒤 저장 (스크롤마다 쓰지 않음)
  useEffect(() => {
    if (currentPage === doc.lastViewedPage) return;
    const timer = window.setTimeout(
      () => void libraryService.rememberPage(doc.id, currentPage),
      500,
    );
    return () => window.clearTimeout(timer);
  }, [currentPage, doc.id, doc.lastViewedPage]);

  const zoomBy = useCallback(
    (direction: 1 | -1) => setZoom({ mode: 'fixed', scale: stepZoom(effectiveScale, direction) }),
    [effectiveScale],
  );
  const goToPage = useCallback((index: number) => viewerRef.current?.goToPage(index), []);

  // 키보드: ←/PageUp 이전, →/PageDown 다음, Home/End
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      switch (event.key) {
        case 'ArrowLeft':
        case 'PageUp':
          event.preventDefault();
          goToPage(Math.max(0, currentPage - 1));
          break;
        case 'ArrowRight':
        case 'PageDown':
          event.preventDefault();
          goToPage(Math.min(doc.pageCount - 1, currentPage + 1));
          break;
        case 'Home':
          event.preventDefault();
          goToPage(0);
          break;
        case 'End':
          event.preventDefault();
          goToPage(doc.pageCount - 1);
          break;
        default:
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPage, doc.pageCount, goToPage]);

  const backHref = doc.folderId === ROOT_FOLDER_ID ? '/' : `/f/${doc.folderId}`;

  return (
    <div className="flex h-dvh flex-col bg-slate-200">
      <ViewerToolbar
        title={doc.title}
        backHref={backHref}
        currentPage={currentPage}
        pageCount={doc.pageCount}
        scalePercent={Math.round(effectiveScale * 100)}
        fitWidth={zoom.mode === 'fit-width'}
        onGoToPage={goToPage}
        onZoomIn={() => zoomBy(1)}
        onZoomOut={() => zoomBy(-1)}
        onFitWidth={() => setZoom({ mode: 'fit-width' })}
        onActualSize={() => setZoom({ mode: 'fixed', scale: 1 })}
      />
      <div className="relative min-h-0 flex-1">
        {pdfState.status === 'ready' ? (
          <PdfViewer
            ref={viewerRef}
            pdf={pdfState.pdf}
            pageSizes={doc.pageSizes}
            initialPage={doc.lastViewedPage}
            zoom={zoom}
            onEffectiveScale={setEffectiveScale}
            onCurrentPage={setCurrentPage}
            onZoomWheel={zoomBy}
          />
        ) : pdfState.status === 'error' ? (
          <ViewerMessage>
            PDF를 열 수 없습니다. <span className="text-slate-400">({pdfState.message})</span>
          </ViewerMessage>
        ) : (
          <ViewerMessage>{blob ? 'PDF를 준비하는 중…' : '파일을 읽는 중…'}</ViewerMessage>
        )}
      </div>
    </div>
  );
}

function ViewerMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center p-8 text-sm text-slate-600">
      {children}
    </div>
  );
}
