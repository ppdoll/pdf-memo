import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { APP_NAME } from '../../../app/brand';
import { hexToRgb01 } from '../../export/svgPath';
import {
  MARGINS,
  PAGE_SIZE,
  THEME,
  layoutDocument,
  type ImageSize,
  type LaidPage,
  type Metrics,
  type Op,
} from './layout';
import type { MarkdownDoc } from './model';

export interface LoadedImage extends ImageSize {
  mime: string;
  bytes: Uint8Array;
}

export interface RenderFonts {
  regular: Uint8Array;
  bold: Uint8Array;
}

export interface RenderInput {
  doc: MarkdownDoc;
  fonts: RenderFonts;
  images?: ReadonlyMap<string, LoadedImage>;
  /** PDF 메타데이터 제목 */
  title?: string | null;
}

export interface RenderOutput {
  bytes: Uint8Array;
  pageCount: number;
}

/** 조판한 마크다운 문서를 pdf-lib으로 그린다. 폰트는 Pretendard Regular/Bold 서브셋 임베드 */
export async function renderMarkdownPdf(input: RenderInput): Promise<RenderOutput> {
  const lib = await import('pdf-lib');
  const { PDFDocument, PDFName, PDFString, PDFArray, degrees, rgb, LineCapStyle } = lib;

  const { createPdfFontkit } = await import('../../text/pdfFontkit');
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(createPdfFontkit());
  const regular = await pdf.embedFont(input.fonts.regular, { subset: true });
  const bold = await pdf.embedFont(input.fonts.bold, { subset: true });
  const fontFor = (isBold: boolean): PDFFont => (isBold ? bold : regular);

  const metrics: Metrics = {
    width(text, size, isBold) {
      try {
        return fontFor(isBold).widthOfTextAtSize(text, size);
      } catch {
        return [...text].length * size * 0.55;
      }
    },
  };

  const images = input.images ?? new Map<string, LoadedImage>();
  const sizes = new Map<string, ImageSize>();
  for (const [src, image] of images) sizes.set(src, { width: image.width, height: image.height });
  const pages: LaidPage[] = layoutDocument(input.doc, metrics, sizes);

  const embedded = new Map<string, PDFImage | null>();
  const embedImage = async (src: string): Promise<PDFImage | null> => {
    if (embedded.has(src)) return embedded.get(src) ?? null;
    const image = images.get(src);
    let result: PDFImage | null = null;
    if (image) {
      try {
        result = /jpe?g$/i.test(image.mime)
          ? await pdf.embedJpg(image.bytes)
          : await pdf.embedPng(image.bytes);
      } catch (error) {
        console.warn('[markdown] image skipped', src, error);
      }
    }
    embedded.set(src, result);
    return result;
  };

  const color = (hex: string) => {
    const { r, g, b } = hexToRgb01(hex);
    return rgb(r, g, b);
  };
  const flipY = (y: number) => PAGE_SIZE.height - y;

  const drawOp = async (page: PDFPage, op: Op) => {
    switch (op.type) {
      case 'text':
        try {
          page.drawText(op.text, {
            x: op.x,
            y: flipY(op.y),
            size: op.size,
            font: fontFor(op.bold),
            color: color(op.color),
            ySkew: op.italic ? degrees(12) : undefined,
          });
        } catch (error) {
          console.warn('[markdown] text skipped', error);
        }
        break;
      case 'rect':
        page.drawRectangle({
          x: op.x,
          y: flipY(op.y + op.h),
          width: op.w,
          height: op.h,
          color: op.fill ? color(op.fill) : undefined,
          borderColor: op.stroke ? color(op.stroke) : undefined,
          borderWidth: op.stroke ? 0.8 : 0,
          borderDashArray: op.stroke ? [3, 3] : undefined,
        });
        break;
      case 'line':
        page.drawLine({
          start: { x: op.x1, y: flipY(op.y1) },
          end: { x: op.x2, y: flipY(op.y2) },
          thickness: op.width,
          color: color(op.color),
        });
        break;
      case 'image': {
        const image = await embedImage(op.src);
        if (image) {
          page.drawImage(image, { x: op.x, y: flipY(op.y + op.h), width: op.w, height: op.h });
        }
        break;
      }
      case 'check': {
        const { x, y, size } = op;
        page.drawRectangle({
          x,
          y: flipY(y + size),
          width: size,
          height: size,
          color: op.checked ? color(THEME.check) : undefined,
          borderColor: color(THEME.check),
          borderWidth: 0.9,
        });
        if (op.checked) {
          page.drawSvgPath('M 2 5 L 4.2 7.2 L 8 3', {
            x,
            y: flipY(y),
            scale: size / 10,
            borderColor: rgb(1, 1, 1),
            borderWidth: 1.6,
            borderLineCap: LineCapStyle.Round,
          });
        }
        break;
      }
      case 'link': {
        const annotation = pdf.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [op.x, flipY(op.y + op.h), op.x + op.w, flipY(op.y)],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(op.href) },
        });
        const ref = pdf.context.register(annotation);
        const existing = page.node.lookupMaybe(PDFName.of('Annots'), PDFArray);
        if (existing) existing.push(ref);
        else page.node.set(PDFName.of('Annots'), pdf.context.obj([ref]));
        break;
      }
      default:
    }
  };

  const total = pages.length;
  for (let index = 0; index < total; index += 1) {
    const page = pdf.addPage([PAGE_SIZE.width, PAGE_SIZE.height]);
    for (const op of pages[index].ops) await drawOp(page, op);
    const label = `${index + 1} / ${total}`;
    const size = 9;
    page.drawText(label, {
      x: (PAGE_SIZE.width - regular.widthOfTextAtSize(label, size)) / 2,
      y: MARGINS.bottom / 2 - size / 2,
      size,
      font: regular,
      color: color(THEME.muted),
    });
  }

  if (input.title) pdf.setTitle(input.title);
  pdf.setProducer(APP_NAME);
  pdf.setCreator(`${APP_NAME} (Markdown)`);
  const bytes = await pdf.save({ useObjectStreams: true });
  return { bytes, pageCount: total };
}
