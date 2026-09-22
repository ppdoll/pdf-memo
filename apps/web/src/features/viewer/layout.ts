import type { PageSize } from '@pdf-memo/shared';

/**
 * 뷰어 레이아웃 계산. 렌더링과 무관한 순수 함수라서 테스트가 쉽고,
 * 가상 스크롤·줌 앵커·현재 페이지 판정이 모두 여기서 나온다.
 */

export interface PageBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ViewerLayout {
  pages: PageBox[];
  totalHeight: number;
  /** 스크롤 컨테이너 안 콘텐츠 폭 (컨테이너 폭과 가장 넓은 페이지 중 큰 값) */
  contentWidth: number;
}

export const PAGE_GAP = 16;
export const VIEW_PADDING = 16;
export const MIN_SCALE = 0.25;
export const MAX_SCALE = 5;
export const ZOOM_STEPS: readonly number[] = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3, 4];

/** 회전을 반영한 표시 크기 (pt) */
export function displaySize(size: PageSize): { w: number; h: number } {
  return size.rotation === 90 || size.rotation === 270
    ? { w: size.h, h: size.w }
    : { w: size.w, h: size.h };
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function computeLayout(
  pageSizes: readonly PageSize[],
  scale: number,
  containerWidth: number,
): ViewerLayout {
  const pages: PageBox[] = [];
  let top = VIEW_PADDING;
  let widest = 0;
  for (const size of pageSizes) {
    const d = displaySize(size);
    const width = Math.round(d.w * scale);
    const height = Math.round(d.h * scale);
    widest = Math.max(widest, width);
    pages.push({ top, left: 0, width, height });
    top += height + PAGE_GAP;
  }
  const contentWidth = Math.max(containerWidth, widest + VIEW_PADDING * 2);
  for (const page of pages) page.left = Math.round((contentWidth - page.width) / 2);
  return {
    pages,
    totalHeight: pages.length === 0 ? 0 : top - PAGE_GAP + VIEW_PADDING,
    contentWidth,
  };
}

/** 가장 넓은 페이지가 컨테이너 폭에 맞는 배율 */
export function fitWidthScale(containerWidth: number, pageSizes: readonly PageSize[]): number {
  const widest = pageSizes.reduce((max, s) => Math.max(max, displaySize(s).w), 0) || 1;
  const available = Math.max(containerWidth - VIEW_PADDING * 2, 100);
  return clampScale(available / widest);
}

/** 미리 정한 단계로 확대·축소. 단계 밖이면 1.25배씩 */
export function stepZoom(current: number, direction: 1 | -1): number {
  if (direction > 0) {
    const next = ZOOM_STEPS.find((z) => z > current + 1e-6);
    return clampScale(next ?? current * 1.25);
  }
  const prev = [...ZOOM_STEPS].reverse().find((z) => z < current - 1e-6);
  return clampScale(prev ?? current / 1.25);
}

/** offset 위치에 있는 페이지 인덱스 (이진 탐색). 첫 페이지 위쪽이면 0 */
export function pageIndexAt(pages: readonly PageBox[], offset: number): number {
  if (pages.length === 0) return 0;
  let lo = 0;
  let hi = pages.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pages[mid].top <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** 마운트할 페이지 범위 [start, end] (inclusive). 비어 있으면 [0, -1] */
export function visibleRange(
  pages: readonly PageBox[],
  scrollTop: number,
  viewportHeight: number,
  overscan = 1,
): [number, number] {
  if (pages.length === 0) return [0, -1];
  const first = pageIndexAt(pages, scrollTop);
  const bottom = scrollTop + viewportHeight;
  let last = first;
  while (last + 1 < pages.length && pages[last + 1].top < bottom) last += 1;
  return [Math.max(0, first - overscan), Math.min(pages.length - 1, last + overscan)];
}

/** 페이지 표시용 현재 페이지: 뷰포트 위쪽 1/3 지점(최대 200px)에 걸린 페이지 */
export function currentPageIndex(
  pages: readonly PageBox[],
  scrollTop: number,
  viewportHeight: number,
): number {
  return pageIndexAt(pages, scrollTop + Math.min(viewportHeight / 3, 200));
}

/** 줌을 바꿔도 같은 지점이 보이도록 하는 앵커 */
export interface ScrollAnchor {
  pageIndex: number;
  /** 페이지 상단에서 scrollTop까지의 거리를 (페이지 높이 + 간격)으로 나눈 비율 */
  ratio: number;
}

export function anchorFor(pages: readonly PageBox[], scrollTop: number): ScrollAnchor {
  const pageIndex = pageIndexAt(pages, scrollTop);
  const page = pages[pageIndex];
  if (!page) return { pageIndex: 0, ratio: 0 };
  return { pageIndex, ratio: (scrollTop - page.top) / Math.max(page.height + PAGE_GAP, 1) };
}

export function scrollTopFor(pages: readonly PageBox[], anchor: ScrollAnchor): number {
  const page = pages[anchor.pageIndex];
  if (!page) return 0;
  return Math.max(0, Math.round(page.top + anchor.ratio * (page.height + PAGE_GAP)));
}
