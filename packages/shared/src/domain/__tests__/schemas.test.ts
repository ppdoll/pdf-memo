import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_SCHEMA_VERSION,
  AnnotationObjectSchema,
  FolderSchema,
  PdfDocumentSchema,
  ROOT_FOLDER_ID,
  createAnnotationBase,
  createFolder,
  createPdfDocument,
  type InkObject,
} from '../..';

const HASH = 'a'.repeat(64);

describe('factory + schema round trip', () => {
  it('createFolder produces a valid Folder under root', () => {
    const folder = createFolder({ name: '  레시피  ', sortKey: 'a0' });
    const parsed = FolderSchema.parse(folder);
    expect(parsed.name).toBe('레시피');
    expect(parsed.parentId).toBe(ROOT_FOLDER_ID);
    expect(parsed.rev).toBe(0);
    expect(parsed.deletedAt).toBeNull();
  });

  it('createPdfDocument produces a valid PdfDocument', () => {
    const doc = createPdfDocument({
      title: '가계부',
      originalFileName: 'budget.pdf',
      blobHash: HASH,
      byteSize: 1234,
      pageCount: 2,
      pageSizes: [
        { w: 595, h: 842, rotation: 0 },
        { w: 595, h: 842, rotation: 0 },
      ],
      sortKey: 'a0',
    });
    expect(PdfDocumentSchema.parse(doc)).toEqual(doc);
  });

  it('rejects an uppercase or short blob hash', () => {
    const doc = createPdfDocument({
      title: 't',
      originalFileName: 'x.pdf',
      blobHash: 'ABC',
      byteSize: 1,
      pageCount: 1,
      pageSizes: [],
      sortKey: 'a0',
    });
    expect(PdfDocumentSchema.safeParse(doc).success).toBe(false);
  });
});

describe('AnnotationObjectSchema', () => {
  const docId = createFolder({ name: 'x', sortKey: 'a0' }).id; // any uuid v7

  function ink(points: number[]): InkObject {
    return {
      ...createAnnotationBase(docId, 0, 1, [0, 0, 10, 10]),
      type: 'ink',
      tool: 'pen',
      color: '#112233',
      opacity: 1,
      width: 2,
      points,
      smoothing: { thinning: 0.5, streamline: 0.5, smoothing: 0.5 },
    };
  }

  it('accepts a valid ink object and keeps the discriminant', () => {
    const parsed = AnnotationObjectSchema.parse(ink([0, 0, 0.5, 10, 10, 0.7]));
    expect(parsed.type).toBe('ink');
    expect(parsed.schemaVersion).toBe(ANNOTATION_SCHEMA_VERSION);
  });

  it('rejects points that are not [x, y, pressure] triples', () => {
    expect(AnnotationObjectSchema.safeParse(ink([0, 0, 0.5, 10])).success).toBe(false);
    expect(AnnotationObjectSchema.safeParse(ink([])).success).toBe(false);
  });

  it('rejects unknown annotation types', () => {
    const bogus = { ...ink([0, 0, 1]), type: 'sparkle' };
    expect(AnnotationObjectSchema.safeParse(bogus).success).toBe(false);
  });

  it('rejects colors that are not #RRGGBB', () => {
    expect(AnnotationObjectSchema.safeParse({ ...ink([0, 0, 1]), color: 'red' }).success).toBe(
      false,
    );
  });
});
