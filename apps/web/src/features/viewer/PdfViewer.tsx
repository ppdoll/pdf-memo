import type { PageSize } from '@pdf-memo/shared';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from 'react';
import {
  VIEW_PADDING,
  anchorFor,
  computeLayout,
  currentPageIndex,
  fitWidthScale,
  scrollTopFor,
  visibleRange,
  type ScrollAnchor,
} from './layout';
import { PageCanvas } from './PageCanvas';

export type ZoomSetting = { mode: 'fit-width' } | { mode: 'fixed'; scale: number };

export interface PdfViewerHandle {
  goToPage(pageIndex: number): void;
}

interface PdfViewerProps {
  pdf: PDFDocumentProxy;
  pageSizes: readonly PageSize[];
  initialPage: number;
  zoom: ZoomSetting;
  onEffectiveScale?: (scale: number) => void;
  onCurrentPage?: (pageIndex: number) => void;
  /** Ctrl/⌘ + 휠 */
  onZoomWheel?: (direction: 1 | -1) => void;
  ref?: Ref<PdfViewerHandle>;
}

/**
 * 세로 가상 스크롤 뷰어. 보이는 페이지 ±1장만 마운트하고,
 * 배율이 바뀌어도 같은 지점이 보이도록 스크롤 앵커를 유지한다.
 */
export function PdfViewer({
  pdf,
  pageSizes,
  initialPage,
  zoom,
  onEffectiveScale,
  onCurrentPage,
  onZoomWheel,
  ref,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const initializedRef = useRef(false);
  const lastReportedPage = useRef(-1);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(
    () => (zoom.mode === 'fit-width' ? fitWidthScale(size.width, pageSizes) : zoom.scale),
    [zoom, size.width, pageSizes],
  );

  useEffect(() => {
    if (size.width > 0) onEffectiveScale?.(scale);
  }, [scale, size.width, onEffectiveScale]);

  const layout = useMemo(
    () => computeLayout(pageSizes, scale, size.width),
    [pageSizes, scale, size.width],
  );

  // 배율 변경 전 앵커를 기준으로 스크롤 위치를 복원한다 (첫 마운트에서는 initialPage로 이동)
  const prevScaleRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || layout.pages.length === 0 || size.width === 0) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      const index = Math.min(Math.max(initialPage, 0), layout.pages.length - 1);
      el.scrollTop = Math.max(0, layout.pages[index].top - VIEW_PADDING);
      setScrollTop(el.scrollTop);
    } else if (
      prevScaleRef.current !== null &&
      prevScaleRef.current !== scale &&
      anchorRef.current
    ) {
      el.scrollTop = scrollTopFor(layout.pages, anchorRef.current);
      setScrollTop(el.scrollTop);
    }
    prevScaleRef.current = scale;
  }, [layout, scale, size.width, initialPage]);

  // Ctrl/⌘ + 휠은 브라우저 페이지 줌이 아니라 뷰어 줌으로. React onWheel은 passive라 native 리스너를 쓴다
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !onZoomWheel) return;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      onZoomWheel(event.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [onZoomWheel]);

  useImperativeHandle(
    ref,
    () => ({
      goToPage(pageIndex: number) {
        const el = containerRef.current;
        const page = layout.pages[pageIndex];
        if (!el || !page) return;
        el.scrollTop = Math.max(0, page.top - VIEW_PADDING);
      },
    }),
    [layout],
  );

  // 스크롤 이벤트는 이미 프레임 단위로 오므로 별도 rAF 없이 바로 처리한다
  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const top = el.scrollTop;
    anchorRef.current = anchorFor(layout.pages, top);
    setScrollTop(top);
    const current = currentPageIndex(layout.pages, top, el.clientHeight);
    if (current !== lastReportedPage.current) {
      lastReportedPage.current = current;
      onCurrentPage?.(current);
    }
  }

  const [start, end] = visibleRange(layout.pages, scrollTop, size.height, 1);
  const visible: number[] = [];
  for (let i = start; i <= end; i += 1) visible.push(i);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="relative h-full w-full overflow-auto bg-slate-200"
      style={{ touchAction: 'pan-x pan-y' }}
    >
      <div
        className="relative"
        style={{ height: layout.totalHeight, width: layout.contentWidth, minWidth: '100%' }}
      >
        {visible.map((index) => (
          <PageCanvas
            key={index}
            pdf={pdf}
            pageIndex={index}
            scale={scale}
            rotation={pageSizes[index]?.rotation ?? 0}
            box={layout.pages[index]}
          />
        ))}
      </div>
    </div>
  );
}
