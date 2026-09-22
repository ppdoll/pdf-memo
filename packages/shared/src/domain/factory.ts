import { newId, nowIso } from '../ids';
import { ANNOTATION_SCHEMA_VERSION, type BBox } from './annotation';
import type { BaseEntity } from './base';
import type { DocumentKind, PageSize, PdfDocument } from './document';
import { ROOT_FOLDER_ID, type Folder } from './folder';

/** 새 엔티티의 공통 필드. rev는 0으로 시작하고 저장소가 첫 저장에서 1로 올린다. */
export function createEntityBase(now: string = nowIso()): BaseEntity {
  return { id: newId(), createdAt: now, updatedAt: now, deletedAt: null, rev: 0, ownerId: null };
}

export interface CreateFolderInput {
  name: string;
  sortKey: string;
  parentId?: string;
  color?: string | null;
  iconAssetId?: string | null;
}

export function createFolder(input: CreateFolderInput): Folder {
  return {
    ...createEntityBase(),
    parentId: input.parentId ?? ROOT_FOLDER_ID,
    name: input.name.trim(),
    color: input.color ?? null,
    iconAssetId: input.iconAssetId ?? null,
    sortKey: input.sortKey,
  };
}

export interface CreatePdfDocumentInput {
  title: string;
  originalFileName: string;
  blobHash: string;
  byteSize: number;
  pageCount: number;
  pageSizes: PageSize[];
  sortKey: string;
  folderId?: string;
  kind?: DocumentKind;
}

export function createPdfDocument(input: CreatePdfDocumentInput): PdfDocument {
  return {
    ...createEntityBase(),
    folderId: input.folderId ?? ROOT_FOLDER_ID,
    kind: input.kind ?? 'pdf',
    title: input.title.trim(),
    originalFileName: input.originalFileName,
    blobHash: input.blobHash,
    byteSize: input.byteSize,
    pageCount: input.pageCount,
    pageSizes: input.pageSizes,
    thumbnailAssetId: null,
    favorite: false,
    tags: [],
    sortKey: input.sortKey,
    lastOpenedAt: null,
    lastViewedPage: 0,
  };
}

/** 주석 객체 공통 필드. 각 타입별 필드는 호출 측에서 스프레드로 덧붙인다. */
export function createAnnotationBase(documentId: string, pageIndex: number, z: number, bbox: BBox) {
  return {
    ...createEntityBase(),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    documentId,
    pageIndex,
    z,
    bbox,
    locked: false,
  };
}
