import 'fake-indexeddb/auto';
import { ROOT_FOLDER_ID, createFolder, createPdfDocument } from '@pdf-memo/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieStorage } from '../../../storage/dexie/DexieStorage';
import { LibraryService } from '../libraryService';

const HASH = 'c'.repeat(64);

let storage: DexieStorage;
let service: LibraryService;

async function seedDocument(folderId: string, title: string, withThumb = false) {
  await storage.blobs.put(HASH, new Blob(['pdf'], { type: 'application/pdf' }));
  let thumbnailAssetId: string | null = null;
  if (withThumb) {
    thumbnailAssetId = `thumb-${title}`;
    await storage.assets.put({
      id: thumbnailAssetId,
      kind: 'thumbnail',
      mime: 'image/jpeg',
      width: 10,
      height: 10,
      byteSize: 3,
      createdAt: new Date().toISOString(),
      ownerId: null,
      data: new Blob(['img']),
    });
  }
  const doc = createPdfDocument({
    title,
    originalFileName: `${title}.pdf`,
    blobHash: HASH,
    byteSize: 3,
    pageCount: 1,
    pageSizes: [{ w: 100, h: 100, rotation: 0 }],
    sortKey: 'a0',
    folderId,
  });
  doc.thumbnailAssetId = thumbnailAssetId;
  return storage.documents.put(doc);
}

beforeEach(() => {
  storage = new DexieStorage(`svc-${Math.random().toString(36).slice(2)}`);
  service = new LibraryService(storage);
});

afterEach(async () => {
  await storage.destroy();
});

describe('folder cascade', () => {
  it('trashes, restores and purges a folder together with its subtree', async () => {
    const parent = await storage.folders.put(createFolder({ name: 'parent', sortKey: 'a0' }));
    const child = await storage.folders.put(
      createFolder({ name: 'child', sortKey: 'a0', parentId: parent.id }),
    );
    const docInParent = await seedDocument(parent.id, 'p');
    const docInChild = await seedDocument(child.id, 'c', true);

    await service.trashFolder(parent.id);
    expect(await storage.folders.children(ROOT_FOLDER_ID)).toHaveLength(0);
    expect((await storage.documents.get(docInChild.id))?.deletedAt).not.toBeNull();
    expect((await storage.folders.get(child.id))?.deletedAt).not.toBeNull();
    expect(await storage.folders.trashed()).toHaveLength(2);

    await service.restoreFolder(parent.id);
    expect((await storage.documents.get(docInParent.id))?.deletedAt).toBeNull();
    expect((await storage.folders.get(child.id))?.deletedAt).toBeNull();
    expect(await storage.folders.children(parent.id)).toHaveLength(1);

    await service.purgeFolder(parent.id);
    expect(await storage.folders.get(parent.id)).toBeUndefined();
    expect(await storage.folders.get(child.id)).toBeUndefined();
    expect(await storage.documents.get(docInChild.id)).toBeUndefined();
    expect(await storage.assets.get('thumb-c')).toBeUndefined();
    expect(await storage.blobs.has(HASH)).toBe(false);
  });
});

describe('documents', () => {
  it('purgeDocument removes annotations, thumbnail and releases the blob at the last reference', async () => {
    const a = await seedDocument(ROOT_FOLDER_ID, 'a', true);
    const b = await seedDocument(ROOT_FOLDER_ID, 'b');
    expect((await storage.blobs.info(HASH))?.refCount).toBe(2);

    await service.trashDocument(a.id);
    await service.purgeDocument(a.id);
    expect(await storage.assets.get('thumb-a')).toBeUndefined();
    expect((await storage.blobs.info(HASH))?.refCount).toBe(1);

    await service.purgeDocument(b.id);
    expect(await storage.blobs.has(HASH)).toBe(false);
  });

  it('emptyTrash purges only trashed items', async () => {
    const keep = await seedDocument(ROOT_FOLDER_ID, 'keep');
    const gone = await seedDocument(ROOT_FOLDER_ID, 'gone');
    const folder = await storage.folders.put(createFolder({ name: 'f', sortKey: 'a0' }));
    await service.trashDocument(gone.id);
    await service.trashFolder(folder.id);

    await service.emptyTrash();
    expect(await storage.documents.get(keep.id)).toBeDefined();
    expect(await storage.documents.get(gone.id)).toBeUndefined();
    expect(await storage.folders.get(folder.id)).toBeUndefined();
    expect(await storage.stats()).toMatchObject({ documents: 1, folders: 0 });
  });

  it('rename and view-state updates behave differently for sync', async () => {
    const doc = await seedDocument(ROOT_FOLDER_ID, 'old');
    const outboxBefore = await storage.outbox.count();

    await service.renameDocument(doc.id, '  new  ');
    const renamed = await storage.documents.get(doc.id);
    expect(renamed?.title).toBe('new');
    expect(renamed?.rev).toBe(doc.rev + 1);
    expect(await storage.outbox.count()).toBe(outboxBefore + 1);

    await service.markOpened(doc.id);
    await service.rememberPage(doc.id, 4);
    const viewed = await storage.documents.get(doc.id);
    expect(viewed?.lastViewedPage).toBe(4);
    expect(viewed?.lastOpenedAt).not.toBeNull();
    expect(viewed?.rev).toBe(renamed?.rev);
    expect(await storage.outbox.count()).toBe(outboxBefore + 1);
    expect((await storage.documents.recent(5)).map((d) => d.id)).toEqual([doc.id]);
  });
});
