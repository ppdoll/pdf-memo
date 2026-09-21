import { z } from 'zod';
import { AnnotationObjectSchema } from '../domain/annotation';
import { AssetMetaSchema } from '../domain/asset';
import { IsoDateTimeSchema } from '../domain/base';
import { PdfDocumentSchema } from '../domain/document';
import { FolderSchema } from '../domain/folder';

/**
 * 2단계 동기화 계약. 1단계에서는 로컬 outbox에 같은 모양으로 기록만 한다.
 * op 'delete'는 소프트 삭제(tombstone)이며 payload는 null.
 */
export const SyncEntitySchema = z.enum(['folder', 'document', 'annotation', 'asset']);
export type SyncEntity = z.infer<typeof SyncEntitySchema>;

export const ChangeOpSchema = z.enum(['upsert', 'delete']);
export type ChangeOp = z.infer<typeof ChangeOpSchema>;

const changeBase = {
  id: z.string().min(1),
  op: ChangeOpSchema,
  rev: z.number().int().nonnegative(),
  updatedAt: IsoDateTimeSchema,
  deviceId: z.string().min(1),
};

export const ChangeSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('folder'), ...changeBase, payload: FolderSchema.nullable() }),
  z.object({ entity: z.literal('document'), ...changeBase, payload: PdfDocumentSchema.nullable() }),
  z.object({
    entity: z.literal('annotation'),
    ...changeBase,
    payload: AnnotationObjectSchema.nullable(),
  }),
  z.object({ entity: z.literal('asset'), ...changeBase, payload: AssetMetaSchema.nullable() }),
]);
export type Change = z.infer<typeof ChangeSchema>;

export const MAX_CHANGES_PER_PUSH = 500;

export const PushRequestSchema = z.object({
  deviceId: z.string().min(1),
  changes: z.array(ChangeSchema).max(MAX_CHANGES_PER_PUSH),
});
export type PushRequest = z.infer<typeof PushRequestSchema>;

export const PushResponseSchema = z.object({
  /** 수락된 change의 id 목록 */
  accepted: z.array(z.string()),
  /** 서버가 더 최신이라 거부된 항목. 서버 버전이 payload에 담겨 온다. */
  conflicts: z.array(ChangeSchema),
  cursor: z.string(),
});
export type PushResponse = z.infer<typeof PushResponseSchema>;

export const PullResponseSchema = z.object({
  changes: z.array(ChangeSchema),
  cursor: z.string(),
  hasMore: z.boolean(),
});
export type PullResponse = z.infer<typeof PullResponseSchema>;
