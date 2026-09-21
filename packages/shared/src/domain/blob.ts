import { z } from 'zod';
import { IsoDateTimeSchema } from './base';
import { Sha256HexSchema } from './document';

/**
 * PDF 바이트의 메타데이터. 실제 바이트는 로컬에서는 IndexedDB Blob,
 * 2단계에서는 오브젝트 스토리지(key = hash)에 저장한다.
 */
export const PdfBlobMetaSchema = z.object({
  hash: Sha256HexSchema,
  byteSize: z.number().int().nonnegative(),
  mime: z.literal('application/pdf'),
  uploadedAt: IsoDateTimeSchema.nullable(),
});

export type PdfBlobMeta = z.infer<typeof PdfBlobMetaSchema>;

/** 개별 PDF 가져오기 상한. 넘으면 거부하고, 절반을 넘으면 경고한다. */
export const MAX_PDF_BYTES = 200 * 1024 * 1024;
export const WARN_PDF_BYTES = 100 * 1024 * 1024;
