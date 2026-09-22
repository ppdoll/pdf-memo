import {
  MAX_FOLDER_DEPTH,
  ROOT_FOLDER_ID,
  nowIso,
  type AnnotationObject,
  type AssetMeta,
  type BaseEntity,
  type Folder,
  type PdfDocument,
} from '@pdf-memo/shared';
import { liveQuery, type Table } from 'dexie';
import type {
  AnnotationRepo,
  Asset,
  AssetStore,
  BlobStore,
  DocumentRepo,
  DocumentViewState,
  FolderRepo,
  ListOptions,
  OutboxEntity,
  OutboxEntry,
  OutboxStore,
  PdfBlobInfo,
  Repo,
  SettingsStore,
  Storage,
  StorageStats,
  Subscribable,
} from '../ports';
import { PdfMemoDB } from './db';

const isAlive = <T extends BaseEntity>(e: T): boolean => e.deletedAt === null;

class DexieRepo<T extends BaseEntity> implements Repo<T> {
  constructor(
    protected readonly db: PdfMemoDB,
    protected readonly table: Table<T, string>,
    protected readonly entity: OutboxEntity,
  ) {}

  /** 쓰기 트랜잭션에 포함할 테이블. 하위 클래스가 확장한다 */
  protected txTables(): Table[] {
    return [this.table, this.db.outbox];
  }

  get(id: string): Promise<T | undefined> {
    return this.table.get(id);
  }

  put(entity: T): Promise<T> {
    return this.db.transaction('rw', this.txTables(), async () => {
      const existing = await this.table.get(entity.id);
      const saved: T = { ...entity, rev: (existing?.rev ?? 0) + 1, updatedAt: nowIso() };
      await this.beforePut(existing, saved);
      await this.table.put(saved);
      await this.record(saved, 'upsert');
      return saved;
    });
  }

  softDelete(id: string): Promise<void> {
    return this.db.transaction('rw', this.txTables(), async () => {
      const existing = await this.mustGet(id);
      if (existing.deletedAt !== null) return;
      const now = nowIso();
      const saved: T = { ...existing, deletedAt: now, rev: existing.rev + 1, updatedAt: now };
      await this.table.put(saved);
      await this.record(saved, 'delete');
    });
  }

  restore(id: string): Promise<void> {
    return this.db.transaction('rw', this.txTables(), async () => {
      const existing = await this.mustGet(id);
      if (existing.deletedAt === null) return;
      const saved: T = { ...existing, deletedAt: null, rev: existing.rev + 1, updatedAt: nowIso() };
      await this.table.put(saved);
      await this.record(saved, 'upsert');
    });
  }

  purge(id: string): Promise<void> {
    return this.db.transaction('rw', this.txTables(), async () => {
      const existing = await this.table.get(id);
      if (!existing) return;
      if (existing.deletedAt === null) {
        // 휴지통을 거치지 않은 물리 삭제도 동기화 tombstone은 남긴다.
        await this.record({ ...existing, rev: existing.rev + 1, updatedAt: nowIso() }, 'delete');
      }
      await this.afterPurge(existing);
      await this.table.delete(id);
    });
  }

  protected async beforePut(_existing: T | undefined, _saved: T): Promise<void> {}

  protected async afterPurge(_existing: T): Promise<void> {}

  protected async mustGet(id: string): Promise<T> {
    const entity = await this.table.get(id);
    if (!entity) throw new Error(`${this.entity} ${id} not found`);
    return entity;
  }

  protected async record(entity: T, op: OutboxEntry['op']): Promise<void> {
    await this.db.outbox.add({
      entity: this.entity,
      entityId: entity.id,
      op,
      rev: entity.rev,
      updatedAt: entity.updatedAt,
    });
  }
}

class DexieFolderRepo extends DexieRepo<Folder> implements FolderRepo {
  children(parentId: string, options?: ListOptions): Promise<Folder[]> {
    const query = this.table.where('parentId').equals(parentId);
    return (options?.includeTrashed ? query : query.filter(isAlive)).sortBy('sortKey');
  }

  watchTrashed(): Subscribable<Folder[]> {
    return liveQuery(() => this.trashed());
  }

  watchChildren(parentId: string): Subscribable<Folder[]> {
    return liveQuery(() => this.children(parentId));
  }

  async path(id: string): Promise<Folder[]> {
    const chain: Folder[] = [];
    let cursor = id;
    while (cursor !== ROOT_FOLDER_ID) {
      const folder = await this.table.get(cursor);
      if (!folder) break;
      chain.unshift(folder);
      cursor = folder.parentId;
      if (chain.length > MAX_FOLDER_DEPTH + 1) {
        throw new Error('folder chain is too deep or cyclic');
      }
    }
    return chain;
  }

  move(id: string, parentId: string): Promise<Folder> {
    return this.db.transaction('rw', this.txTables(), async () => {
      const folder = await this.mustGet(id);
      if (parentId === id) throw new Error('폴더를 자기 자신 안으로 이동할 수 없습니다');
      if (parentId !== ROOT_FOLDER_ID) {
        const targetPath = await this.path(parentId);
        if (targetPath.length === 0) throw new Error('대상 폴더가 없습니다');
        if (targetPath.some((f) => f.id === id)) {
          throw new Error('폴더를 자기 하위 폴더로 이동할 수 없습니다');
        }
        const depth = targetPath.length + (await this.subtreeDepth(id));
        if (depth > MAX_FOLDER_DEPTH) {
          throw new Error(`폴더는 최대 ${MAX_FOLDER_DEPTH}단계까지 중첩할 수 있습니다`);
        }
      }
      return this.put({ ...folder, parentId });
    });
  }

  trashed(): Promise<Folder[]> {
    return this.table.filter((f) => f.deletedAt !== null).toArray();
  }

  protected override async beforePut(existing: Folder | undefined, saved: Folder): Promise<void> {
    if (existing || saved.parentId === ROOT_FOLDER_ID) return;
    const parentPath = await this.path(saved.parentId);
    if (parentPath.length === 0) throw new Error('상위 폴더가 없습니다');
    if (parentPath.length >= MAX_FOLDER_DEPTH) {
      throw new Error(`폴더는 최대 ${MAX_FOLDER_DEPTH}단계까지 중첩할 수 있습니다`);
    }
  }

  /** id 폴더 자신을 1로 세는 서브트리 깊이 */
  private async subtreeDepth(id: string): Promise<number> {
    const kids = await this.table.where('parentId').equals(id).toArray();
    if (kids.length === 0) return 1;
    const depths = await Promise.all(kids.map((k) => this.subtreeDepth(k.id)));
    return 1 + Math.max(...depths);
  }
}

class DexieDocumentRepo extends DexieRepo<PdfDocument> implements DocumentRepo {
  protected override txTables(): Table[] {
    return [this.table, this.db.outbox, this.db.pdfBlobs];
  }

  inFolder(folderId: string, options?: ListOptions): Promise<PdfDocument[]> {
    const query = this.table.where('folderId').equals(folderId);
    return (options?.includeTrashed ? query : query.filter(isAlive)).sortBy('sortKey');
  }

  watchInFolder(folderId: string): Subscribable<PdfDocument[]> {
    return liveQuery(() => this.inFolder(folderId));
  }

  recent(limit: number): Promise<PdfDocument[]> {
    return this.table.orderBy('lastOpenedAt').reverse().filter(isAlive).limit(limit).toArray();
  }

  watchRecent(limit: number): Subscribable<PdfDocument[]> {
    return liveQuery(() => this.recent(limit));
  }

  watchTrashed(): Subscribable<PdfDocument[]> {
    return liveQuery(() => this.trashed());
  }

  async updateViewState(id: string, patch: Partial<DocumentViewState>): Promise<void> {
    await this.table.update(id, patch);
  }

  byBlobHash(hash: string): Promise<PdfDocument[]> {
    return this.table.where('blobHash').equals(hash).filter(isAlive).toArray();
  }

  trashed(): Promise<PdfDocument[]> {
    return this.table.filter((d) => d.deletedAt !== null).toArray();
  }

  protected override async beforePut(
    existing: PdfDocument | undefined,
    saved: PdfDocument,
  ): Promise<void> {
    if (existing?.blobHash === saved.blobHash) return;
    await this.adjustRef(saved.blobHash, +1);
    if (existing) await this.adjustRef(existing.blobHash, -1);
  }

  protected override async afterPurge(existing: PdfDocument): Promise<void> {
    await this.adjustRef(existing.blobHash, -1);
  }

  private async adjustRef(hash: string, delta: 1 | -1): Promise<void> {
    const row = await this.db.pdfBlobs.get(hash);
    if (!row) {
      if (delta > 0) {
        throw new Error(`PdfBlob ${hash} not found. Put the blob before the document.`);
      }
      return;
    }
    const refCount = row.refCount + delta;
    if (refCount <= 0) {
      await this.db.pdfBlobs.delete(hash);
    } else {
      await this.db.pdfBlobs.update(hash, { refCount });
    }
  }
}

class DexieAnnotationRepo extends DexieRepo<AnnotationObject> implements AnnotationRepo {
  page(documentId: string, pageIndex: number): Promise<AnnotationObject[]> {
    return this.table
      .where('[documentId+pageIndex]')
      .equals([documentId, pageIndex])
      .filter(isAlive)
      .sortBy('z');
  }

  watchPage(documentId: string, pageIndex: number): Subscribable<AnnotationObject[]> {
    return liveQuery(() => this.page(documentId, pageIndex));
  }

  forDocument(documentId: string): Promise<AnnotationObject[]> {
    return this.table.where('documentId').equals(documentId).filter(isAlive).toArray();
  }

  bulkPut(objects: AnnotationObject[]): Promise<AnnotationObject[]> {
    return this.db.transaction('rw', this.txTables(), async () => {
      const saved: AnnotationObject[] = [];
      for (const object of objects) saved.push(await this.put(object));
      return saved;
    });
  }

  purgeForDocument(documentId: string): Promise<number> {
    return this.table.where('documentId').equals(documentId).delete();
  }
}

class DexieBlobStore implements BlobStore {
  constructor(private readonly db: PdfMemoDB) {}

  async get(hash: string): Promise<Blob | undefined> {
    return (await this.db.pdfBlobs.get(hash))?.data;
  }

  async has(hash: string): Promise<boolean> {
    return (await this.db.pdfBlobs.where('hash').equals(hash).count()) > 0;
  }

  async put(hash: string, data: Blob): Promise<void> {
    await this.db.transaction('rw', this.db.pdfBlobs, async () => {
      if (await this.has(hash)) return;
      await this.db.pdfBlobs.add({
        hash,
        byteSize: data.size,
        data,
        refCount: 0,
        uploadedAt: null,
      });
    });
  }

  async info(hash: string): Promise<PdfBlobInfo | undefined> {
    const row = await this.db.pdfBlobs.get(hash);
    if (!row) return undefined;
    const { data: _data, ...info } = row;
    return info;
  }

  pruneOrphans(): Promise<number> {
    return this.db.pdfBlobs.filter((b) => b.refCount <= 0).delete();
  }
}

class DexieAssetStore implements AssetStore {
  constructor(private readonly db: PdfMemoDB) {}

  get(id: string): Promise<Asset | undefined> {
    return this.db.assets.get(id);
  }

  async put(asset: Asset): Promise<void> {
    await this.db.assets.put(asset);
  }

  list(kind: AssetMeta['kind']): Promise<Asset[]> {
    return this.db.assets.where('kind').equals(kind).toArray();
  }

  remove(id: string): Promise<void> {
    return this.db.assets.delete(id);
  }
}

class DexieSettingsStore implements SettingsStore {
  constructor(private readonly db: PdfMemoDB) {}

  async get<T>(key: string): Promise<T | undefined> {
    return (await this.db.settings.get(key))?.value as T | undefined;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.db.settings.put({ key, value });
  }

  remove(key: string): Promise<void> {
    return this.db.settings.delete(key);
  }
}

class DexieOutboxStore implements OutboxStore {
  constructor(private readonly db: PdfMemoDB) {}

  pending(limit: number): Promise<OutboxEntry[]> {
    return this.db.outbox.orderBy('seq').limit(limit).toArray();
  }

  async ack(upToSeq: number): Promise<void> {
    await this.db.outbox.where('seq').belowOrEqual(upToSeq).delete();
  }

  count(): Promise<number> {
    return this.db.outbox.count();
  }
}

export class DexieStorage implements Storage {
  readonly db: PdfMemoDB;
  readonly folders: FolderRepo;
  readonly documents: DocumentRepo;
  readonly annotations: AnnotationRepo;
  readonly blobs: BlobStore;
  readonly assets: AssetStore;
  readonly settings: SettingsStore;
  readonly outbox: OutboxStore;

  constructor(dbName?: string) {
    this.db = new PdfMemoDB(dbName);
    this.folders = new DexieFolderRepo(this.db, this.db.folders, 'folder');
    this.documents = new DexieDocumentRepo(this.db, this.db.documents, 'document');
    this.annotations = new DexieAnnotationRepo(this.db, this.db.annotations, 'annotation');
    this.blobs = new DexieBlobStore(this.db);
    this.assets = new DexieAssetStore(this.db);
    this.settings = new DexieSettingsStore(this.db);
    this.outbox = new DexieOutboxStore(this.db);
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return this.db.transaction('rw', this.db.tables, fn);
  }

  async stats(): Promise<StorageStats> {
    const [folders, documents, annotations, pdfBlobs, assets, outboxPending, blobRows] =
      await Promise.all([
        this.db.folders.count(),
        this.db.documents.count(),
        this.db.annotations.count(),
        this.db.pdfBlobs.count(),
        this.db.assets.count(),
        this.db.outbox.count(),
        this.db.pdfBlobs.toArray(),
      ]);
    return {
      folders,
      documents,
      annotations,
      pdfBlobs,
      assets,
      outboxPending,
      pdfBytes: blobRows.reduce((sum, b) => sum + b.byteSize, 0),
    };
  }

  /** 테스트·초기화용. 데이터베이스를 통째로 삭제한다 */
  async destroy(): Promise<void> {
    await this.db.delete();
  }
}

export function createStorage(dbName?: string): DexieStorage {
  return new DexieStorage(dbName);
}
