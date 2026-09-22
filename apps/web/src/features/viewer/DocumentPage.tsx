import { ROOT_FOLDER_ID, type PdfDocument } from '@pdf-memo/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { storage } from '../../storage';
import { AnnotationToolbar } from '../annotate/AnnotationToolbar';
import { AnnotationSession } from '../annotate/session';
import {
  loadToolSettings,
  persistToolSettings,
  useToolStore,
  type Tool,
} from '../annotate/toolStore';
import { ExportMenu } from '../export/ExportMenu';
import { libraryService } from '../library/service';
import { stepZoom } from './layout';
import { PdfViewer, type PdfViewerHandle, type ZoomSetting } from './PdfViewer';
import { usePdfDocument } from './usePdfDocument';
import { ViewerToolbar } from './ViewerToolbar';

const TOOL_KEYS: Record<string, Tool> = {
  p: 'pen',
  h: 'highlighter',
  m: 'marker',
  e: 'eraser',
  v: 'hand',
};

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

  // 도구 설정은 앱 전체에서 하나. 뷰어가 열릴 때 불러오고 바뀌면 저장한다
  useEffect(() => {
    void loadToolSettings(storage);
    return persistToolSettings(storage);
  }, []);

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
  const session = useMemo(() => new AnnotationSession(storage, doc.id), [doc.id]);

  useEffect(() => () => session.dispose(), [session]);

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

  // 키보드: Ctrl+Z/Shift+Z 취소·재실행, P/H/M/E/V 도구, ←→ PageUp/Down Home/End 페이지 이동
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      if (mod && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) session.redo();
        else session.undo();
        return;
      }
      if (mod && key === 'y') {
        event.preventDefault();
        session.redo();
        return;
      }
      if (!mod && !event.altKey && TOOL_KEYS[key]) {
        useToolStore.getState().setTool(TOOL_KEYS[key]);
        return;
      }
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
  }, [currentPage, doc.pageCount, goToPage, session]);

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
        trailing={<ExportMenu documentId={doc.id} beforeExport={() => session.flush()} />}
      />
      <AnnotationToolbar session={session} />
      <div className="relative min-h-0 flex-1">
        {pdfState.status === 'ready' ? (
          <PdfViewer
            ref={viewerRef}
            pdf={pdfState.pdf}
            pageSizes={doc.pageSizes}
            initialPage={doc.lastViewedPage}
            zoom={zoom}
            session={session}
            onZoomChange={setZoom}
            onEffectiveScale={setEffectiveScale}
            onCurrentPage={setCurrentPage}
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
