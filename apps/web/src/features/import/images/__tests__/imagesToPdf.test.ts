import { PDFDict, PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { HEIC_MESSAGE, imagesTitle, isHeicFile, isImageFile } from '../detect';
import { IMAGE_PAGE_SHORT_SIDE, buildImagePdf, imagePageSize } from '../imagesToPdf';

const PNG_1X1 = new Uint8Array(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const file = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type });

describe('image file detection', () => {
  it('recognises images by type or extension and flags HEIC', () => {
    expect(isImageFile(file('a.jpg', ''))).toBe(true);
    expect(isImageFile(file('a', 'image/webp'))).toBe(true);
    expect(isImageFile(file('a.pdf', 'application/pdf'))).toBe(false);
    expect(isImageFile(file('memo.md', 'text/markdown'))).toBe(false);
    expect(isHeicFile(file('IMG_1.HEIC', ''))).toBe(true);
    expect(isHeicFile(file('x', 'image/heif'))).toBe(true);
    expect(isHeicFile(file('a.jpg', 'image/jpeg'))).toBe(false);
    expect(HEIC_MESSAGE).toContain('JPEG');
  });

  it('names one image after its file and several as "첫 이름 외 N장"', () => {
    expect(imagesTitle([file('요리.jpg', 'image/jpeg')])).toBe('요리');
    expect(
      imagesTitle([file('스캔 1.png', ''), file('스캔 2.png', ''), file('스캔 3.png', '')]),
    ).toBe('스캔 1 외 2장');
  });
});

describe('imagePageSize', () => {
  it('keeps the aspect ratio with the short side equal to the A4 width', () => {
    expect(imagePageSize(3000, 4000)).toEqual({ w: IMAGE_PAGE_SHORT_SIDE, h: 793.71 });
    expect(imagePageSize(4000, 3000)).toEqual({ w: 793.71, h: IMAGE_PAGE_SHORT_SIDE });
    expect(imagePageSize(500, 500)).toEqual({ w: IMAGE_PAGE_SHORT_SIDE, h: IMAGE_PAGE_SHORT_SIDE });
  });
});

describe('buildImagePdf', () => {
  it('makes one full-bleed page per image in order and sets the title', async () => {
    const { bytes, pageCount } = await buildImagePdf(
      [
        { mime: 'image/png', bytes: PNG_1X1, width: 1200, height: 1600 },
        { mime: 'image/png', bytes: PNG_1X1, width: 1600, height: 900 },
      ],
      '스캔 외 1장',
    );
    expect(pageCount).toBe(2);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getTitle()).toBe('스캔 외 1장');
    const [portrait, landscape] = doc.getPages();
    expect(portrait.getWidth()).toBeCloseTo(IMAGE_PAGE_SHORT_SIDE, 1);
    expect(portrait.getHeight()).toBeCloseTo(793.71, 1);
    expect(landscape.getHeight()).toBeCloseTo(IMAGE_PAGE_SHORT_SIDE, 1);
    expect(landscape.getWidth()).toBeCloseTo(1058.28, 1);
    for (const page of doc.getPages()) {
      const xobjects = page.node.Resources()?.lookupMaybe(PDFName.of('XObject'), PDFDict);
      expect(xobjects?.entries().length).toBe(1);
    }
  });

  it('rejects an empty list', async () => {
    await expect(buildImagePdf([], 'x')).rejects.toThrow('이미지가 없습니다');
  });
});
