import { marked, type Token, type Tokens } from 'marked';
import type { Align, Block, HeadingLevel, InlineRun, ListItem, MarkdownDoc } from './model';
import { plainText } from './model';

/** Pretendard에 없는 이모지·이형 선택자·결합자는 지운다(빈 상자로 찍히는 것보다 낫다) */
const cp = (code: number) => String.fromCodePoint(code);
const UNSUPPORTED = new RegExp(
  [
    `[${cp(0x1f000)}-${cp(0x1faff)}]`,
    `[${cp(0x2600)}-${cp(0x27bf)}]`,
    `[${cp(0x1f1e6)}-${cp(0x1f1ff)}]`,
    cp(0xfe0e),
    cp(0xfe0f),
    cp(0x200d),
    cp(0x20e3),
  ].join('|'),
  'gu',
);

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

export function sanitizeText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/&(amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(UNSUPPORTED, '')
    .replace(/\t/g, '    ')
    .replace(new RegExp(cp(0xa0), 'g'), ' ');
}

function stripHtml(html: string): string {
  return sanitizeText(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
      .replace(/<[^>]*>/g, ''),
  ).replace(/\n{3,}/g, '\n\n');
}

type Style = Omit<InlineRun, 'text'>;

const sameStyle = (a: Style, b: Style) =>
  !!a.bold === !!b.bold &&
  !!a.italic === !!b.italic &&
  !!a.code === !!b.code &&
  !!a.strike === !!b.strike &&
  (a.link ?? null) === (b.link ?? null);

function push(out: InlineRun[], rawText: string, style: Style) {
  const text = rawText.includes('\n') && rawText !== '\n' ? rawText : sanitizeText(rawText);
  if (text.length === 0) return;
  const last = out.at(-1);
  if (last && sameStyle(last, style) && text !== '\n' && last.text !== '\n') {
    last.text += text;
    return;
  }
  const run: InlineRun = { text };
  if (style.bold) run.bold = true;
  if (style.italic) run.italic = true;
  if (style.code) run.code = true;
  if (style.strike) run.strike = true;
  if (style.link) run.link = style.link;
  out.push(run);
}

function inlineRuns(tokens: Token[] | undefined, style: Style, out: InlineRun[]): InlineRun[] {
  for (const token of tokens ?? []) {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text;
        if (t.tokens && t.tokens.length > 0) inlineRuns(t.tokens, style, out);
        else push(out, t.text, style);
        break;
      }
      case 'escape':
        push(out, (token as Tokens.Escape).text, style);
        break;
      case 'strong':
        inlineRuns((token as Tokens.Strong).tokens, { ...style, bold: true }, out);
        break;
      case 'em':
        inlineRuns((token as Tokens.Em).tokens, { ...style, italic: true }, out);
        break;
      case 'del':
        inlineRuns((token as Tokens.Del).tokens, { ...style, strike: true }, out);
        break;
      case 'codespan':
        push(out, (token as Tokens.Codespan).text, { ...style, code: true });
        break;
      case 'link': {
        const link = token as Tokens.Link;
        inlineRuns(link.tokens, { ...style, link: link.href }, out);
        break;
      }
      case 'image': {
        const image = token as Tokens.Image;
        push(out, `[이미지: ${image.text || image.href}]`, { ...style, italic: true });
        break;
      }
      case 'br':
        push(out, '\n', style);
        break;
      case 'html':
        push(out, stripHtml((token as Tokens.HTML).text), style);
        break;
      default:
        if ('text' in token && typeof token.text === 'string') push(out, token.text, style);
    }
  }
  return out;
}

const runsOf = (tokens: Token[] | undefined): InlineRun[] => inlineRuns(tokens, {}, []);

/** 문단이 이미지 하나만 담고 있으면 그 이미지 토큰 */
function soleImage(tokens: Token[] | undefined): Tokens.Image | null {
  const meaningful = (tokens ?? []).filter(
    (t) => !(t.type === 'text' && (t as Tokens.Text).text.trim() === ''),
  );
  if (meaningful.length === 1 && meaningful[0].type === 'image') {
    return meaningful[0] as Tokens.Image;
  }
  return null;
}

function listItem(item: Tokens.ListItem): ListItem {
  const runs: InlineRun[] = [];
  const children: Block[] = [];
  for (const token of item.tokens) {
    if (token.type === 'text' || token.type === 'paragraph') {
      if (runs.length > 0) push(runs, '\n', {});
      inlineRuns((token as Tokens.Text | Tokens.Paragraph).tokens, {}, runs);
    } else if (token.type !== 'space') {
      children.push(...toBlocks([token]));
    }
  }
  return { runs, checked: item.task ? Boolean(item.checked) : null, children };
}

function toBlocks(tokens: Token[]): Block[] {
  const blocks: Block[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case 'heading': {
        const t = token as Tokens.Heading;
        const level = Math.min(6, Math.max(1, t.depth)) as HeadingLevel;
        blocks.push({ kind: 'heading', level, runs: runsOf(t.tokens) });
        break;
      }
      case 'paragraph': {
        const t = token as Tokens.Paragraph;
        const image = soleImage(t.tokens);
        if (image) blocks.push({ kind: 'image', src: image.href, alt: sanitizeText(image.text) });
        else blocks.push({ kind: 'paragraph', runs: runsOf(t.tokens) });
        break;
      }
      case 'text': {
        const t = token as Tokens.Text;
        const runs = t.tokens ? runsOf(t.tokens) : runsOf([t]);
        if (plainText(runs)) blocks.push({ kind: 'paragraph', runs });
        break;
      }
      case 'list': {
        const t = token as Tokens.List;
        blocks.push({
          kind: 'list',
          ordered: t.ordered,
          start: typeof t.start === 'number' ? t.start : 1,
          items: t.items.map(listItem),
        });
        break;
      }
      case 'code': {
        const t = token as Tokens.Code;
        blocks.push({ kind: 'code', text: sanitizeText(t.text), lang: t.lang?.trim() || null });
        break;
      }
      case 'blockquote':
        blocks.push({ kind: 'quote', blocks: toBlocks((token as Tokens.Blockquote).tokens) });
        break;
      case 'table': {
        const t = token as Tokens.Table;
        blocks.push({
          kind: 'table',
          header: t.header.map((cell) => runsOf(cell.tokens)),
          rows: t.rows.map((row) => row.map((cell) => runsOf(cell.tokens))),
          align: t.align.map((a) => (a === 'left' || a === 'center' || a === 'right' ? a : null)),
        });
        break;
      }
      case 'hr':
        blocks.push({ kind: 'hr' });
        break;
      case 'html': {
        const text = stripHtml((token as Tokens.HTML).text).trim();
        if (text) blocks.push({ kind: 'paragraph', runs: [{ text }] });
        break;
      }
      default:
      // space, def 등은 건너뛴다
    }
  }
  return blocks;
}

/** 마크다운 텍스트를 문서 모델로. 제목은 첫 1단계 헤딩 */
export function parseMarkdown(markdown: string): MarkdownDoc {
  const tokens = marked.lexer(markdown, { gfm: true, breaks: false });
  const blocks = toBlocks(tokens);
  const first = blocks.find((b) => b.kind === 'heading' && b.level === 1);
  const title = first && first.kind === 'heading' ? plainText(first.runs).slice(0, 300) : '';
  return { title: title.length > 0 ? title : null, blocks };
}

/** 일반 텍스트(.txt): 줄바꿈을 그대로 살리는 마크다운으로 */
export function plainTextToMarkdown(text: string): string {
  return sanitizeText(text)
    .split('\n')
    .map((line) => line.replace(/^([#>*\-+]|\d+\.)/, '\\$1'))
    .join('  \n');
}

export type { Align };
