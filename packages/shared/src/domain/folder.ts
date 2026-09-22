import { z } from 'zod';
import { BaseEntitySchema } from './base';

/**
 * 루트 폴더의 sentinel id.
 * IndexedDB는 null을 인덱싱하지 못하므로 "부모 없음"을 null 대신 이 값으로 표현한다.
 */
export const ROOT_FOLDER_ID = 'root';

/** UI에서 허용하는 최대 중첩 깊이 (루트 직속 폴더 = 1) */
export const MAX_FOLDER_DEPTH = 5;

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'expected #RRGGBB');

export const FolderSchema = BaseEntitySchema.extend({
  /** ROOT_FOLDER_ID 또는 상위 폴더 id */
  parentId: z.string().min(1),
  name: z.string().trim().min(1).max(200),
  color: HexColorSchema.nullable(),
  /** 폴더 아이콘 이미지 (Asset kind 'icon'). 없거나 null이면 color 네모를 그린다 */
  iconAssetId: z.string().nullable().optional(),
  /** fractional index. 같은 부모 안에서의 수동 정렬 순서 */
  sortKey: z.string().min(1),
});

export type Folder = z.infer<typeof FolderSchema>;
