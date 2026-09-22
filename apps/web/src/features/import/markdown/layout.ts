import { tokenize } from '../../text/wrap';
import type { Align, Block, HeadingLevel, InlineRun, ListItem, MarkdownDoc } from './model';

/** A4 세로 (pt) */
export const PAGE_SIZE = { width: 595.28, height: 841.89 } as const;
export const MARGINS = { top: 64, bottom: 64, left: 56, right: 56 } as const;
export const CONTENT_WIDTH = PAGE_SIZE.width - MARGINS.left - MARGINS.right;

export const THEME = {
  text: '#1f2937',
  heading: '#111827',
  muted: '#6b7280',
  quote: '#4b5563',
  quoteBar: '#d1d5db',
  link: '#2563eb',
  codeBg: '#f3f4f6',
  codeText: '#111827',
  rule: '#e5e7eb',
  tableBorder: '#d1d5db',
  tableHeaderBg: '#f8fafc',
  check: '#4f46e5',
  placeholder: '#94a3b8',
} as const;

const BODY = { size: 11, lineHeight: 1.55, after: 8 };
const CODE = { size: 9.5, lineHeight: 1.45, padding: 8, after: 10 };
const TABLE = { size: 10, lineHeight: 1.4, cellPad: 6, minCol: 40, after: 10 };
const LIST = { indent: 18, bulletWidth: 16, itemGap: 2, after: 8 };
const QUOTE = { indent: 14, bar: 3, after: 8 };
const IMAGE = { pxToPt: 0.75, maxHeightRatio: 0.6, after: 10 };
/** 글줄 위에서 기준선까지 (ascent ≈ 0.8em, flatten과 같은 값) */
const BASELINE_RATIO = 0.8;

const HEADINGS: Record<HeadingLevel, { size: number; before: number; after: number }> = {
  1: { size: 26, before: 20, after: 10 },
  2: { size: 21, before: 16, after: 8 },
  3: { size: 17, before: 14, after: 6 },
  4: { size: 14, before: 12, after: 4 },
  5: { size: 12.5, before: 10, after: 4 },
  6: { size: 11.5, before: 10, after: 4 },
};

export interface Metrics {
  /** 글자폭 (pt) */
  width(text: string, size: number, bold: boolean): number;
}

export interface ImageSize {
  width: number;
  height: number;
}

/** 좌표는 페이지 좌상단 원점, y 아래 (렌더러가 PDF 좌표로 뒤집는다) */
export type Op =
  | {
      type: 'text';
      x: number;
      /** 기준선 */
      y: number;
      text: string;
      size: number;
      bold: boolean;
      italic: boolean;
      color: string;
    }
  | { type: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { type: 'image'; x: number; y: number; w: number; h: number; src: string }
  | { type: 'link'; x: number; y: number; w: number; h: number; href: string }
  | { type: 'check'; x: number; y: number; size: number; checked: boolean };

export interface LaidPage {
  ops: Op[];
}

interface Column {
  left: number;
  right: number;
}

interface TextStyle {
  size: number;
  lineHeight: number;
  color: string;
  bold?: boolean;
  align?: Align;
}

interface Segment {
  text: string;
  run: InlineRun;
  width: number;
}

interface Line {
  segments: Segment[];
  width: number;
}

const BOTTOM = PAGE_SIZE.height - MARGINS.bottom;

class Layouter {
  readonly pages: Op[][] = [[]];
  y: number = MARGINS.top;

  constructor(
    private readonly metrics: Metrics,
    private readonly images: ReadonlyMap<string, ImageSize>,
  ) {}

  get pageIndex(): number {
    return this.pages.length - 1;
  }

  private get ops(): Op[] {
    return this.pages[this.pages.length - 1];
  }

  private emit(op: Op) {
    this.ops.push(op);
  }

  private atTop(): boolean {
    return this.y <= MARGINS.top + 0.01;
  }

  newPage() {
    this.pages.push([]);
    this.y = MARGINS.top;
  }

  /** h만큼 자리가 없으면 새 페이지 (페이지 맨 위에서는 그대로) */
  ensure(h: number) {
    if (this.y + h > BOTTOM && !this.atTop()) this.newPage();
  }

  private measure(text: string, size: number, bold: boolean): number {
    return this.metrics.width(text, size, bold);
  }

  // ----- 줄 나누기 -----

  buildLines(runs: readonly InlineRun[], width: number, size: number, baseBold: boolean): Line[] {
    const lines: Line[] = [];
    let line: Line = { segments: [], width: 0 };
    const isBold = (run: InlineRun) => baseBold || !!run.bold;

    const closeLine = () => {
      const last = line.segments.at(-1);
      if (last) {
        const trimmed = last.text.replace(/\s+$/, '');
        if (trimmed !== last.text) {
          line.width -= last.width;
          last.text = trimmed;
          last.width = trimmed ? this.measure(trimmed, size, isBold(last.run)) : 0;
          line.width += last.width;
          if (!trimmed) line.segments.pop();
        }
      }
      lines.push(line);
      line = { segments: [], width: 0 };
    };

    const append = (piece: string, run: InlineRun, pieceWidth: number) => {
      const last = line.segments.at(-1);
      if (last && last.run === run) {
        last.text += piece;
        last.width += pieceWidth;
      } else {
        line.segments.push({ text: piece, run, width: pieceWidth });
      }
      line.width += pieceWidth;
    };

    for (const run of runs) {
      const parts = run.text.split('\n');
      parts.forEach((part, partIndex) => {
        if (partIndex > 0) closeLine();
        for (const piece of tokenize(part)) {
          const w = this.measure(piece, size, isBold(run));
          if (line.width + w > width && line.segments.length > 0 && piece.trim() !== '') {
            closeLine();
          }
          if (w > width) {
            // 한 조각이 한 줄보다 길면 글자 단위로 자른다
            let chunk = '';
            let chunkWidth = 0;
            for (const ch of piece) {
              const cw = this.measure(ch, size, isBold(run));
              if (chunkWidth + cw > width && chunk) {
                append(chunk, run, chunkWidth);
                closeLine();
                chunk = '';
                chunkWidth = 0;
              }
              chunk += ch;
              chunkWidth += cw;
            }
            if (chunk) append(chunk, run, chunkWidth);
            continue;
          }
          if (line.segments.length === 0 && piece.trim() === '') continue;
          append(piece, run, w);
        }
      });
    }
    if (line.segments.length > 0 || lines.length === 0) closeLine();
    return lines;
  }

  /** 줄들을 현재 위치에 찍는다. 페이지가 모자라면 줄 단위로 넘긴다. 쓴 높이를 돌려준다 */
  emitLines(lines: Line[], col: Column, style: TextStyle): number {
    const lineHeight = style.size * style.lineHeight;
    const width = col.right - col.left;
    let used = 0;
    for (const line of lines) {
      this.ensure(lineHeight);
      const shift =
        style.align === 'center'
          ? (width - line.width) / 2
          : style.align === 'right'
            ? width - line.width
            : 0;
      let x = col.left + Math.max(0, shift);
      const baseline = this.y + (lineHeight - style.size) / 2 + style.size * BASELINE_RATIO;
      for (const seg of line.segments) {
        const run = seg.run;
        if (run.code) {
          this.emit({
            type: 'rect',
            x: x - 1,
            y: this.y + (lineHeight - style.size) / 2 - 1,
            w: seg.width + 2,
            h: style.size + 2,
            fill: THEME.codeBg,
          });
        }
        this.emit({
          type: 'text',
          x,
          y: baseline,
          text: seg.text,
          size: style.size,
          bold: !!style.bold || !!run.bold,
          italic: !!run.italic,
          color: run.link ? THEME.link : run.code ? THEME.codeText : style.color,
        });
        if (run.link) {
          this.emit({
            type: 'line',
            x1: x,
            y1: baseline + 1.5,
            x2: x + seg.width,
            y2: baseline + 1.5,
            color: THEME.link,
            width: 0.6,
          });
          if (/^https?:\/\//i.test(run.link)) {
            this.emit({
              type: 'link',
              x,
              y: this.y,
              w: seg.width,
              h: lineHeight,
              href: run.link,
            });
          }
        }
        if (run.strike) {
          this.emit({
            type: 'line',
            x1: x,
            y1: baseline - style.size * 0.3,
            x2: x + seg.width,
            y2: baseline - style.size * 0.3,
            color: style.color,
            width: 0.8,
          });
        }
        x += seg.width;
      }
      this.y += lineHeight;
      used += lineHeight;
    }
    return used;
  }

  text(runs: readonly InlineRun[], col: Column, style: TextStyle): number {
    const lines = this.buildLines(runs, col.right - col.left, style.size, !!style.bold);
    return this.emitLines(lines, col, style);
  }

  // ----- 블록 -----

  blocks(blocks: readonly Block[], col: Column, color: string) {
    for (const block of blocks) this.block(block, col, color);
  }

  block(block: Block, col: Column, color: string) {
    switch (block.kind) {
      case 'heading':
        this.heading(block.level, block.runs, col);
        break;
      case 'paragraph':
        this.text(block.runs, col, { size: BODY.size, lineHeight: BODY.lineHeight, color });
        this.y += BODY.after;
        break;
      case 'list':
        this.list(block.items, block.ordered, block.start, col, color, 0);
        this.y += LIST.after;
        break;
      case 'code':
        this.code(block.text, col);
        break;
      case 'quote':
        this.quote(block.blocks, col);
        break;
      case 'table':
        this.table(block.header, block.rows, block.align, col, color);
        break;
      case 'hr':
        this.ensure(20);
        this.emit({
          type: 'line',
          x1: col.left,
          y1: this.y + 10,
          x2: col.right,
          y2: this.y + 10,
          color: THEME.rule,
          width: 1,
        });
        this.y += 20;
        break;
      case 'image':
        this.image(block.src, block.alt, col);
        break;
      default:
    }
  }

  heading(level: HeadingLevel, runs: readonly InlineRun[], col: Column) {
    const spec = HEADINGS[level];
    const lineHeight = 1.25;
    const bodyLine = BODY.size * BODY.lineHeight;
    // 제목이 페이지 끝에 홀로 남지 않도록 본문 두 줄까지 함께 잰다
    this.ensure(spec.before + spec.size * lineHeight + bodyLine * 2);
    if (!this.atTop()) this.y += spec.before;
    this.text(runs, col, { size: spec.size, lineHeight, color: THEME.heading, bold: true });
    if (level <= 2) {
      this.emit({
        type: 'line',
        x1: col.left,
        y1: this.y + 3,
        x2: col.right,
        y2: this.y + 3,
        color: THEME.rule,
        width: level === 1 ? 1.2 : 0.8,
      });
      this.y += 6;
    }
    this.y += spec.after;
  }

  list(
    items: readonly ListItem[],
    ordered: boolean,
    start: number,
    col: Column,
    color: string,
    depth: number,
  ) {
    const left = col.left + depth * LIST.indent;
    const textCol: Column = { left: left + LIST.bulletWidth, right: col.right };
    const lineHeight = BODY.size * BODY.lineHeight;
    items.forEach((item, index) => {
      this.ensure(lineHeight);
      const top = this.y;
      const baseline = top + (lineHeight - BODY.size) / 2 + BODY.size * BASELINE_RATIO;
      if (item.checked !== null) {
        const size = 9;
        this.emit({
          type: 'check',
          x: left + 1,
          y: top + (lineHeight - size) / 2,
          size,
          checked: item.checked,
        });
      } else if (ordered) {
        const label = `${start + index}.`;
        const w = this.metrics.width(label, BODY.size, false);
        this.emit({
          type: 'text',
          x: left + LIST.bulletWidth - 4 - w,
          y: baseline,
          text: label,
          size: BODY.size,
          bold: false,
          italic: false,
          color,
        });
      } else {
        this.emit({
          type: 'text',
          x: left + 3,
          y: baseline,
          text: depth % 2 === 0 ? '•' : '–',
          size: BODY.size,
          bold: false,
          italic: false,
          color,
        });
      }
      if (item.runs.length > 0) {
        this.text(item.runs, textCol, { size: BODY.size, lineHeight: BODY.lineHeight, color });
      } else {
        this.y += lineHeight;
      }
      this.y += LIST.itemGap;
      for (const child of item.children) {
        if (child.kind === 'list') {
          this.list(child.items, child.ordered, child.start, col, color, depth + 1);
        } else {
          this.block(child, textCol, color);
        }
      }
    });
  }

  code(text: string, col: Column) {
    const lineHeight = CODE.size * CODE.lineHeight;
    const innerWidth = col.right - col.left - CODE.padding * 2;
    const lines: string[] = [];
    for (const raw of text.split('\n')) {
      if (raw === '') {
        lines.push('');
        continue;
      }
      const wrapped = this.buildLines([{ text: raw }], innerWidth, CODE.size, false);
      for (const line of wrapped) lines.push(line.segments.map((s) => s.text).join(''));
    }
    let index = 0;
    while (index < lines.length) {
      this.ensure(lineHeight + CODE.padding * 2);
      const available = BOTTOM - this.y - CODE.padding * 2;
      const count = Math.max(1, Math.min(lines.length - index, Math.floor(available / lineHeight)));
      const height = count * lineHeight + CODE.padding * 2;
      this.emit({
        type: 'rect',
        x: col.left,
        y: this.y,
        w: col.right - col.left,
        h: height,
        fill: THEME.codeBg,
      });
      let y = this.y + CODE.padding;
      for (let i = 0; i < count; i += 1) {
        const line = lines[index + i];
        if (line) {
          this.emit({
            type: 'text',
            x: col.left + CODE.padding,
            y: y + (lineHeight - CODE.size) / 2 + CODE.size * BASELINE_RATIO,
            text: line,
            size: CODE.size,
            bold: false,
            italic: false,
            color: THEME.codeText,
          });
        }
        y += lineHeight;
      }
      this.y += height;
      index += count;
      if (index < lines.length) this.newPage();
    }
    this.y += CODE.after;
  }

  quote(blocks: readonly Block[], col: Column) {
    const startPage = this.pageIndex;
    const startY = this.y;
    const inner: Column = { left: col.left + QUOTE.indent, right: col.right };
    this.blocks(blocks, inner, THEME.quote);
    // 마지막 블록의 아래 여백은 인용 막대에 넣지 않는다
    const endPage = this.pageIndex;
    const endY = Math.max(startY, this.y - BODY.after);
    for (let page = startPage; page <= endPage; page += 1) {
      const top = page === startPage ? startY : MARGINS.top;
      const bottom = page === endPage ? endY : BOTTOM;
      if (bottom - top <= 0) continue;
      this.pages[page].push({
        type: 'rect',
        x: col.left,
        y: top,
        w: QUOTE.bar,
        h: bottom - top,
        fill: THEME.quoteBar,
      });
    }
    this.y += QUOTE.after;
  }

  table(
    header: readonly InlineRun[][],
    rows: readonly InlineRun[][][],
    align: readonly Align[],
    col: Column,
    color: string,
  ) {
    const columns = Math.max(header.length, ...rows.map((r) => r.length));
    if (columns === 0) return;
    const width = col.right - col.left;
    const natural = new Array<number>(columns).fill(TABLE.minCol);
    const measureCell = (runs: InlineRun[] | undefined, bold: boolean) =>
      (runs ?? []).reduce(
        (sum, run) =>
          sum +
          run.text
            .split('\n')
            .reduce(
              (m, part) => Math.max(m, this.metrics.width(part, TABLE.size, bold || !!run.bold)),
              0,
            ),
        0,
      );
    for (let c = 0; c < columns; c += 1) {
      natural[c] = Math.max(natural[c], measureCell(header[c], true) + TABLE.cellPad * 2);
      for (const row of rows)
        natural[c] = Math.max(natural[c], measureCell(row[c], false) + TABLE.cellPad * 2);
    }
    const total = natural.reduce((a, b) => a + b, 0);
    const factor = columns >= 2 || total > width ? width / total : 1;
    const widths = natural.map((w) => w * factor);

    const lineHeight = TABLE.size * TABLE.lineHeight;
    const layoutRow = (cells: readonly InlineRun[][], bold: boolean) => {
      const cellLines = widths.map((w, c) =>
        this.buildLines(cells[c] ?? [], w - TABLE.cellPad * 2, TABLE.size, bold),
      );
      const height =
        Math.max(1, ...cellLines.map((l) => l.length)) * lineHeight + TABLE.cellPad * 2;
      return { cellLines, height };
    };
    const drawRow = (cellLines: Line[][], height: number, bold: boolean, isHeader: boolean) => {
      const top = this.y;
      if (isHeader) {
        this.emit({
          type: 'rect',
          x: col.left,
          y: top,
          w: width,
          h: height,
          fill: THEME.tableHeaderBg,
        });
      }
      let x = col.left;
      cellLines.forEach((lines, c) => {
        const cellCol: Column = { left: x + TABLE.cellPad, right: x + widths[c] - TABLE.cellPad };
        this.y = top + TABLE.cellPad;
        this.emitLines(lines, cellCol, {
          size: TABLE.size,
          lineHeight: TABLE.lineHeight,
          color: bold ? THEME.heading : color,
          bold,
          align: align[c] ?? null,
        });
        x += widths[c];
      });
      this.y = top + height;
      this.emit({
        type: 'line',
        x1: col.left,
        y1: this.y,
        x2: col.right,
        y2: this.y,
        color: THEME.tableBorder,
        width: isHeader ? 1 : 0.5,
      });
    };

    const head = layoutRow(header, true);
    this.ensure(head.height + lineHeight + TABLE.cellPad * 2);
    this.emit({
      type: 'line',
      x1: col.left,
      y1: this.y,
      x2: col.right,
      y2: this.y,
      color: THEME.tableBorder,
      width: 1,
    });
    drawRow(head.cellLines, head.height, true, true);
    for (const row of rows) {
      const laid = layoutRow(row, false);
      if (this.y + laid.height > BOTTOM && !this.atTop()) {
        this.newPage();
        drawRow(head.cellLines, head.height, true, true);
      }
      drawRow(laid.cellLines, laid.height, false, false);
    }
    this.y += TABLE.after;
  }

  image(src: string, alt: string, col: Column) {
    const width = col.right - col.left;
    const info = this.images.get(src);
    if (!info) {
      const height = 36;
      this.ensure(height + IMAGE.after);
      this.emit({
        type: 'rect',
        x: col.left,
        y: this.y,
        w: width,
        h: height,
        stroke: THEME.placeholder,
      });
      const label = alt ? `이미지를 불러올 수 없음: ${alt}` : '이미지를 불러올 수 없음';
      const lines = this.buildLines([{ text: label }], width - 16, TABLE.size, false).slice(0, 1);
      const saved = this.y;
      this.y += (height - TABLE.size * TABLE.lineHeight) / 2;
      this.emitLines(
        lines,
        { left: col.left + 8, right: col.right - 8 },
        {
          size: TABLE.size,
          lineHeight: TABLE.lineHeight,
          color: THEME.muted,
          align: 'center',
        },
      );
      this.y = saved + height + IMAGE.after;
      return;
    }
    const maxHeight = (BOTTOM - MARGINS.top) * IMAGE.maxHeightRatio;
    let w = info.width * IMAGE.pxToPt;
    let h = info.height * IMAGE.pxToPt;
    const scale = Math.min(1, width / w, maxHeight / h);
    w *= scale;
    h *= scale;
    this.ensure(h);
    this.emit({ type: 'image', x: col.left + (width - w) / 2, y: this.y, w, h, src });
    this.y += h + IMAGE.after;
  }
}

/** 문서를 A4 페이지들의 그리기 명령으로 조판한다 (순수 함수: 글자폭과 이미지 크기만 주입) */
export function layoutDocument(
  doc: MarkdownDoc,
  metrics: Metrics,
  images: ReadonlyMap<string, ImageSize> = new Map(),
): LaidPage[] {
  const layouter = new Layouter(metrics, images);
  const col: Column = { left: MARGINS.left, right: PAGE_SIZE.width - MARGINS.right };
  layouter.blocks(doc.blocks, col, THEME.text);
  return layouter.pages.map((ops) => ({ ops }));
}
