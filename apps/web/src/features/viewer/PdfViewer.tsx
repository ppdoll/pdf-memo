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
import { AnnotationLayer } from '../annotate/AnnotationLayer';
import { distance, type Point } from '../annotate/geometry';
import { penTracker } from '../annotate/penTracker';
import type { AnnotationSession } from '../annotate/session';
import { useToolStore } from '../annotate/toolStore';
import {
  VIEW_PADDING,
  anchorFor,
  clampScale,
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
  session: AnnotationSession;
  onZoomChange: (zoom: ZoomSetting) => void;
  onEffectiveScale?: (scale: number) => void;
  onCurrentPage?: (pageIndex: number) => void;
  ref?: Ref<PdfViewerHandle>;
}

interface PinchPreview {
  origin: Point;
  translate: Point;
  factor: number;
}

const FALLBACK_PAGE: PageSize = { w: 612, h: 792, rotation: 0 };

/**
 * 세로 가상 스크롤 뷰어 + 페이지별 주석 레이어.
 * - 보이는 페이지 ±1장만 마운트
 * - 배율이 바뀌어도 같은 지점이 보이도록 스크롤 앵커 유지
 * - 그리기 도구일 때 손가락: 한 개는 이동, 두 개는 핀치 확대 (펜이 닿아 있으면 손바닥으로 보고 무시)
 * - 손 도구일 때: 네이티브 터치 스크롤, 마우스 드래그 이동
 */
export function PdfViewer({
  pdf,
  pageSizes,
  initialPage,
  zoom,
  session,
  onZoomChange,
  onEffectiveScale,
  onCurrentPage,
  ref,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [scrollTop, setScrollTop] = useState(0);
  const [preview, setPreview] = useState<PinchPreview | null>(null);
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const pendingScrollRef = useRef<{ left: number; top: number } | null>(null);
  const initializedRef = useRef(false);
  const lastReportedPage = useRef(-1);
  const tool = useToolStore((s) => s.tool);
  const fingerDraws = useToolStore((s) => s.fingerDraws);

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

  // 스크롤 위치 복원: 첫 마운트는 initialPage, 핀치 종료는 pendingScroll, 그 외 배율 변경은 앵커
  const prevScaleRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || layout.pages.length === 0 || size.width === 0) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      const index = Math.min(Math.max(initialPage, 0), layout.pages.length - 1);
      el.scrollTop = Math.max(0, layout.pages[index].top - VIEW_PADDING);
      setScrollTop(el.scrollTop);
    } else if (pendingScrollRef.current && prevScaleRef.current !== scale) {
      el.scrollLeft = pendingScrollRef.current.left;
      el.scrollTop = pendingScrollRef.current.top;
      pendingScrollRef.current = null;
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

  // 최신 값을 네이티브 리스너에서 읽기 위한 ref
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const fingerDrawsRef = useRef(fingerDraws);
  fingerDrawsRef.current = fingerDraws;
  const onZoomChangeRef = useRef(onZoomChange);
  onZoomChangeRef.current = onZoomChange;

  // Ctrl/⌘ + 휠 → 뷰어 줌 (React onWheel은 passive라 preventDefault가 안 됨)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      const next = clampScale(scaleRef.current * factor);
      if (next === scaleRef.current) return;
      const ratio = next / scaleRef.current;
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      pendingScrollRef.current = {
        left: (el.scrollLeft + mx) * ratio - mx,
        top: (el.scrollTop + my) * ratio - my,
      };
      onZoomChangeRef.current({ mode: 'fixed', scale: next });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // 터치 제스처(이동·핀치)와 손 도구의 마우스 드래그
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const el: HTMLDivElement = container;
    const touches = new Map<number, Point>();
    let pinch: {
      startDist: number;
      startMid: Point;
      content: Point;
      startScale: number;
      factor: number;
      mid: Point;
    } | null = null;
    let drag: { pointerId: number; last: Point } | null = null;

    const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    function onDown(event: PointerEvent) {
      if (event.pointerType === 'touch') {
        if (toolRef.current === 'hand' || fingerDrawsRef.current || penTracker.isPalmWindow())
          return;
        touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (touches.size === 2 && !pinch) {
          const [a, b] = [...touches.values()];
          const mid = midpoint(a, b);
          const rect = el.getBoundingClientRect();
          pinch = {
            startDist: Math.max(distance(a, b), 1),
            startMid: mid,
            content: { x: el.scrollLeft + mid.x - rect.left, y: el.scrollTop + mid.y - rect.top },
            startScale: scaleRef.current,
            factor: 1,
            mid,
          };
          setPreview({ origin: pinch.content, translate: { x: 0, y: 0 }, factor: 1 });
        }
      } else if (
        event.pointerType === 'mouse' &&
        toolRef.current === 'hand' &&
        event.button === 0
      ) {
        drag = { pointerId: event.pointerId, last: { x: event.clientX, y: event.clientY } };
        el.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    }

    function onMove(event: PointerEvent) {
      if (drag && event.pointerId === drag.pointerId) {
        el.scrollBy(drag.last.x - event.clientX, drag.last.y - event.clientY);
        drag.last = { x: event.clientX, y: event.clientY };
        return;
      }
      if (event.pointerType !== 'touch' || !touches.has(event.pointerId)) return;
      const prev = touches.get(event.pointerId) as Point;
      const current = { x: event.clientX, y: event.clientY };
      touches.set(event.pointerId, current);
      if (pinch && touches.size >= 2) {
        const [a, b] = [...touches.values()];
        const mid = midpoint(a, b);
        const target = clampScale(pinch.startScale * (distance(a, b) / pinch.startDist));
        pinch.factor = target / pinch.startScale;
        pinch.mid = mid;
        setPreview({
          origin: pinch.content,
          translate: { x: mid.x - pinch.startMid.x, y: mid.y - pinch.startMid.y },
          factor: pinch.factor,
        });
      } else if (!pinch && touches.size === 1) {
        el.scrollBy(prev.x - current.x, prev.y - current.y);
      }
    }

    function onUp(event: PointerEvent) {
      if (drag && event.pointerId === drag.pointerId) {
        drag = null;
        return;
      }
      if (event.pointerType !== 'touch') return;
      touches.delete(event.pointerId);
      if (pinch && touches.size < 2) {
        const rect = el.getBoundingClientRect();
        const ratio = pinch.factor;
        const left = pinch.content.x * ratio - (pinch.mid.x - rect.left);
        const top = pinch.content.y * ratio - (pinch.mid.y - rect.top);
        const nextScale = clampScale(pinch.startScale * ratio);
        pinch = null;
        touches.clear();
        setPreview(null);
        if (Math.abs(ratio - 1) > 0.01 && nextScale !== scaleRef.current) {
          pendingScrollRef.current = { left, top };
          onZoomChangeRef.current({ mode: 'fixed', scale: nextScale });
        } else {
          el.scrollLeft = left;
          el.scrollTop = top;
        }
      }
    }

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, []);

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
      style={{
        touchAction: tool === 'hand' ? 'pan-x pan-y' : 'none',
        cursor: tool === 'hand' ? 'grab' : undefined,
      }}
      data-viewer-scroll
    >
      <div
        className="relative"
        style={{
          height: layout.totalHeight,
          width: layout.contentWidth,
          minWidth: '100%',
          transform: preview
            ? `translate(${preview.translate.x}px, ${preview.translate.y}px) scale(${preview.factor})`
            : undefined,
          transformOrigin: preview ? `${preview.origin.x}px ${preview.origin.y}px` : undefined,
          willChange: preview ? 'transform' : undefined,
        }}
      >
        {visible.map((index) => {
          const pageSize = pageSizes[index] ?? FALLBACK_PAGE;
          return (
            <div key={index}>
              <PageCanvas
                pdf={pdf}
                pageIndex={index}
                scale={scale}
                rotation={pageSize.rotation}
                box={layout.pages[index]}
              />
              <AnnotationLayer
                session={session}
                pageIndex={index}
                pageSize={pageSize}
                scale={scale}
                box={layout.pages[index]}
                interactive={preview === null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
