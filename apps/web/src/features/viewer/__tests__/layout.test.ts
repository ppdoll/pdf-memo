import type { PageSize } from '@pdf-memo/shared';
import { describe, expect, it } from 'vitest';
import {
  PAGE_GAP,
  VIEW_PADDING,
  anchorFor,
  computeLayout,
  currentPageIndex,
  displaySize,
  fitWidthScale,
  pageIndexAt,
  scrollTopFor,
  stepZoom,
  visibleRange,
} from '../layout';

const letter: PageSize = { w: 612, h: 792, rotation: 0 };
const landscape: PageSize = { w: 612, h: 792, rotation: 90 };

describe('displaySize', () => {
  it('swaps width and height for 90/270 rotation', () => {
    expect(displaySize(letter)).toEqual({ w: 612, h: 792 });
    expect(displaySize(landscape)).toEqual({ w: 792, h: 612 });
    expect(displaySize({ ...letter, rotation: 180 })).toEqual({ w: 612, h: 792 });
  });
});

describe('computeLayout', () => {
  it('stacks pages vertically with gaps and centers them', () => {
    const layout = computeLayout([letter, landscape], 1, 1000);
    expect(layout.pages[0]).toEqual({ top: VIEW_PADDING, left: 194, width: 612, height: 792 });
    expect(layout.pages[1].top).toBe(VIEW_PADDING + 792 + PAGE_GAP);
    expect(layout.pages[1].width).toBe(792);
    expect(layout.pages[1].left).toBe(104);
    expect(layout.totalHeight).toBe(VIEW_PADDING + 792 + PAGE_GAP + 612 + VIEW_PADDING);
    expect(layout.contentWidth).toBe(1000);
  });

  it('grows content width when a page is wider than the container', () => {
    const layout = computeLayout([letter], 2, 400);
    expect(layout.contentWidth).toBe(1224 + VIEW_PADDING * 2);
    expect(layout.pages[0].left).toBe(VIEW_PADDING);
  });

  it('handles an empty document', () => {
    expect(computeLayout([], 1, 500)).toEqual({ pages: [], totalHeight: 0, contentWidth: 500 });
  });
});

describe('fitWidthScale and stepZoom', () => {
  it('fits the widest page into the container minus padding', () => {
    expect(fitWidthScale(612 + VIEW_PADDING * 2, [letter])).toBeCloseTo(1);
    expect(fitWidthScale(792 + VIEW_PADDING * 2, [letter, landscape])).toBeCloseTo(1);
  });

  it('steps through the preset zoom levels and clamps at the ends', () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.8);
    expect(stepZoom(0.9, 1)).toBe(1);
    expect(stepZoom(4, 1)).toBe(5);
    expect(stepZoom(5, 1)).toBe(5);
    expect(stepZoom(0.5, -1)).toBe(0.4);
  });
});

describe('scroll helpers', () => {
  const pages = computeLayout([letter, letter, letter, letter], 1, 800).pages;

  it('finds the page at an offset', () => {
    expect(pageIndexAt(pages, 0)).toBe(0);
    expect(pageIndexAt(pages, pages[1].top)).toBe(1);
    expect(pageIndexAt(pages, pages[1].top - 1)).toBe(0);
    expect(pageIndexAt(pages, 1e9)).toBe(3);
    expect(pageIndexAt([], 10)).toBe(0);
  });

  it('computes the visible range with overscan', () => {
    expect(visibleRange(pages, 0, 900, 0)).toEqual([0, 1]);
    expect(visibleRange(pages, 0, 900, 1)).toEqual([0, 2]);
    expect(visibleRange(pages, pages[3].top, 900, 1)).toEqual([2, 3]);
    expect(visibleRange([], 0, 900)).toEqual([0, -1]);
  });

  it('reports the current page from the upper third of the viewport', () => {
    expect(currentPageIndex(pages, 0, 900)).toBe(0);
    expect(currentPageIndex(pages, pages[1].top - 100, 900)).toBe(1);
  });

  it('round-trips a scroll anchor across a zoom change', () => {
    const scrollTop = pages[2].top + 100;
    const anchor = anchorFor(pages, scrollTop);
    expect(anchor.pageIndex).toBe(2);
    const zoomed = computeLayout([letter, letter, letter, letter], 2, 800).pages;
    const restored = scrollTopFor(zoomed, anchor);
    expect(restored).toBe(Math.round(zoomed[2].top + anchor.ratio * (zoomed[2].height + PAGE_GAP)));
    expect(scrollTopFor([], anchor)).toBe(0);
  });
});
