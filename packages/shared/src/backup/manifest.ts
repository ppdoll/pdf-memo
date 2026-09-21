import { z } from 'zod';
import { IsoDateTimeSchema } from '../domain/base';

/**
 * 백업 zip 구조
 *   manifest.json
 *   folders.json                     Folder[]
 *   documents.json                   PdfDocument[]
 *   annotations/<documentId>.json    AnnotationObject[]
 *   assets/<assetId>                 바이너리 (+ assets.json 메타)
 *   pdfs/<hash>.pdf                  원본 PDF
 * 복원은 병합: 같은 id는 updatedAt이 최신인 쪽, 없는 id는 추가.
 */
export const BACKUP_FORMAT_VERSION = 1;
export const BACKUP_FILE_EXTENSION = '.pdfmemo.zip';

const Count = z.number().int().nonnegative();

export const BackupManifestSchema = z.object({
  formatVersion: z.literal(BACKUP_FORMAT_VERSION),
  appVersion: z.string(),
  annotationSchemaVersion: z.number().int().positive(),
  exportedAt: IsoDateTimeSchema,
  deviceId: z.string().min(1),
  counts: z.object({
    folders: Count,
    documents: Count,
    annotations: Count,
    assets: Count,
    pdfs: Count,
  }),
});

export type BackupManifest = z.infer<typeof BackupManifestSchema>;
