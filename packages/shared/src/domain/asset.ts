import { z } from 'zod';
import { IsoDateTimeSchema } from './base';

export const AssetKindSchema = z.enum(['sticker', 'image', 'thumbnail', 'icon']);
export type AssetKind = z.infer<typeof AssetKindSchema>;

/**
 * 스티커·이미지·썸네일 메타데이터. 바이트는 로컬 Blob / 오브젝트 스토리지.
 * id: 사용자 업로드는 sha-256 hex, 내장 팩은 'pack:<pack>/<name>'.
 */
export const AssetMetaSchema = z.object({
  id: z.string().min(1),
  kind: AssetKindSchema,
  mime: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  byteSize: z.number().int().nonnegative(),
  createdAt: IsoDateTimeSchema,
  ownerId: z.string().nullable(),
});

export type AssetMeta = z.infer<typeof AssetMetaSchema>;
