import { z } from 'zod';

export const IsoDateTimeSchema = z.iso.datetime();

/** 엔티티 id: UUID v7 (Folder·PdfDocument·Annotation) */
export const EntityIdSchema = z.uuid();

/**
 * 모든 영속 엔티티의 공통 필드.
 * 휴지통(deletedAt), 충돌 감지(rev), 2단계 계정 연결(ownerId)이 여기에 의존한다.
 */
export const BaseEntitySchema = z.object({
  id: EntityIdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  /** null이면 살아 있음, 값이 있으면 휴지통(동기화에서는 tombstone) */
  deletedAt: IsoDateTimeSchema.nullable(),
  /** 로컬 변경마다 +1. 저장소 계층이 관리한다. */
  rev: z.number().int().nonnegative(),
  /** 1단계: null. 2단계 계정 연결 시 userId. */
  ownerId: z.string().nullable(),
});

export type BaseEntity = z.infer<typeof BaseEntitySchema>;
