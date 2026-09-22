import { z } from 'zod';
import { BaseEntitySchema, IsoDateTimeSchema } from './base';

export const Sha256HexSchema = z.string().regex(/^[0-9a-f]{64}$/, 'expected lowercase sha-256 hex');

export const PageRotationSchema = z.union([
  z.literal(0),
  z.literal(90),
  z.literal(180),
  z.literal(270),
]);

/** 페이지 크기 (PDF pt 단위, 회전 전 기준) */
export const PageSizeSchema = z.object({
  w: z.number().positive(),
  h: z.number().positive(),
  rotation: PageRotationSchema,
});
export type PageSize = z.infer<typeof PageSizeSchema>;

/** 문서 종류. 'json'은 PDF 대신 JSON 트리 뷰어로 열린다 */
export const DocumentKindSchema = z.enum(['pdf', 'json']);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

/**
 * PDF 파일 한 개. 바이트는 PdfBlob(내용 해시로 주소화)에 따로 저장하고 여기서는 참조만 한다.
 * 이름을 Document로 하면 DOM의 Document와 충돌하므로 PdfDocument로 둔다.
 */
export const PdfDocumentSchema = BaseEntitySchema.extend({
  /** ROOT_FOLDER_ID 또는 폴더 id */
  folderId: z.string().min(1),
  /** 없으면 'pdf' (초기 데이터 호환) */
  kind: DocumentKindSchema.optional(),
  title: z.string().trim().min(1).max(300),
  originalFileName: z.string().max(300),
  blobHash: Sha256HexSchema,
  byteSize: z.number().int().nonnegative(),
  pageCount: z.number().int().positive(),
  pageSizes: z.array(PageSizeSchema),
  thumbnailAssetId: z.string().nullable(),
  favorite: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(50)),
  sortKey: z.string().min(1),
  lastOpenedAt: IsoDateTimeSchema.nullable(),
  /** 0-based */
  lastViewedPage: z.number().int().nonnegative(),
});

export type PdfDocument = z.infer<typeof PdfDocumentSchema>;

export function documentKind(doc: Pick<PdfDocument, 'kind'>): DocumentKind {
  return doc.kind ?? 'pdf';
}
