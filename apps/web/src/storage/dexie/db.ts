import type { AnnotationObject, Folder, PdfDocument } from '@pdf-memo/shared';
import Dexie, { type Table } from 'dexie';
import type { Asset, OutboxEntry } from '../ports';

export interface PdfBlobRow {
  hash: string;
  byteSize: number;
  data: Blob;
  refCount: number;
  uploadedAt: string | null;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface SyncStateRow {
  key: string;
  value: string;
}

export type OutboxInsert = Omit<OutboxEntry, 'seq'>;

export const DB_NAME = 'pdf-memo';

/**
 * IndexedDB 스키마 v1.
 * - null·boolean은 IndexedDB 키가 될 수 없다. 그래서 루트 폴더는 ROOT_FOLDER_ID sentinel을 쓰고,
 *   favorite 같은 boolean은 인덱스에 넣지 않는다. deletedAt은 값이 있는(휴지통) 행만 인덱스에 잡힌다.
 * - 스키마 변경은 반드시 version(n).stores().upgrade()로만 한다.
 */
export class PdfMemoDB extends Dexie {
  folders!: Table<Folder, string>;
  documents!: Table<PdfDocument, string>;
  pdfBlobs!: Table<PdfBlobRow, string>;
  annotations!: Table<AnnotationObject, string>;
  assets!: Table<Asset, string>;
  settings!: Table<SettingRow, string>;
  syncState!: Table<SyncStateRow, string>;
  outbox!: Table<OutboxEntry, number, OutboxInsert>;

  constructor(name: string = DB_NAME) {
    super(name);
    this.version(1).stores({
      folders: 'id, parentId, updatedAt, deletedAt',
      documents: 'id, folderId, blobHash, updatedAt, deletedAt, lastOpenedAt, *tags',
      pdfBlobs: 'hash',
      annotations: 'id, [documentId+pageIndex], documentId, updatedAt, deletedAt',
      assets: 'id, kind',
      settings: 'key',
      syncState: 'key',
      outbox: '++seq, entity, entityId',
    });
  }
}
