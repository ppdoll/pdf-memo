import 'fake-indexeddb/auto';
import {
  ROOT_FOLDER_ID,
  createAnnotationBase,
  createFolder,
  createPdfDocument,
  type InkObject,
} from '@pdf-memo/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieStorage } from '../dexie/DexieStorage';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function pdfBlob(text: string): Blob {
  return new Blob([text], { type: 'application/pdf' });
}

function doc(blobHash: string, title = '문서') {
  return createPdfDocument({
    title,
    originalFileName: `${title}.pdf`,
    blobHash,
    byteSize: 10,
    pageCount: 1,
    pageSizes: [{ w: 595, h: 842, rotation: 0 }],
    sortKey: 'a0',
  });
}

function ink(documentId: string, pageIndex: number, z: number): InkObject {
  return {
    ...createAnnotationBase(documentId, pageIndex, z, [0, 0, 10, 10]),
    type: 'ink',
    tool: 'pen',
    color: '#000000',
    opacity: 1,
    width: 2,
    points: [0, 0, 0.5, 10, 10, 0.5],
    smoothing: { thinning: 0.5, streamline: 0.5, smoothing: 0.5 },
  };
}

let storage: DexieStorage;

beforeEach(() => {
  storage = new DexieStorage(`test-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  await storage.destroy();
});

describe('folders', () => {
  it('put bumps rev, refreshes updatedAt and records an outbox entry', async () => {
    const draft = createFolder({ name: '레시피', sortKey: 'a0' });
    const saved = await storage.folders.put(draft);
    expect(saved.rev).toBe(1);
    expect(saved.updatedAt >= draft.updatedAt).toBe(true);

    const again = await storage.folders.put({ ...saved, name: '레시피 모음' });
    expect(again.rev).toBe(2);

    const outbox = await storage.outbox.pending(10);
    expect(outbox.map((o) => [o.entity, o.op, o.rev])).toEqual([
      ['folder', 'upsert', 1],
      ['folder', 'upsert', 2],
    ]);
  });

  it('children lists live folders of a parent ordered by sortKey', async () => {
    await storage.folders.put(createFolder({ name: 'B', sortKey: 'a1' }));
    await storage.folders.put(createFolder({ name: 'A', sortKey: 'a0' }));
    const other = await storage.folders.put(createFolder({ name: 'X', sortKey: 'a2' }));
    await storage.folders.put(createFolder({ name: 'child', sortKey: 'a0', parentId: other.id }));

    const root = await storage.folders.children(ROOT_FOLDER_ID);
    expect(root.map((f) => f.name)).toEqual(['A', 'B', 'X']);
    expect((await storage.folders.children(other.id)).map((f) => f.name)).toEqual(['child']);
  });

  it('softDelete hides, restore brings back, purge removes', async () => {
    const f = await storage.folders.put(createFolder({ name: '임시', sortKey: 'a0' }));

    await storage.folders.softDelete(f.id);
    expect(await storage.folders.children(ROOT_FOLDER_ID)).toHaveLength(0);
    expect((await storage.folders.trashed()).map((x) => x.id)).toEqual([f.id]);

    await storage.folders.restore(f.id);
    expect(await storage.folders.children(ROOT_FOLDER_ID)).toHaveLength(1);

    await storage.folders.purge(f.id);
    expect(await storage.folders.get(f.id)).toBeUndefined();

    const ops = (await storage.outbox.pending(10)).map((o) => o.op);
    expect(ops).toEqual(['upsert', 'delete', 'upsert', 'delete']);
  });

  it('path walks up to the root and move rejects cycles and unknown targets', async () => {
    const a = await storage.folders.put(createFolder({ name: 'a', sortKey: 'a0' }));
    const b = await storage.folders.put(createFolder({ name: 'b', sortKey: 'a0', parentId: a.id }));
    const c = await storage.folders.put(createFolder({ name: 'c', sortKey: 'a0', parentId: b.id }));

    expect((await storage.folders.path(c.id)).map((f) => f.name)).toEqual(['a', 'b', 'c']);

    await expect(storage.folders.move(a.id, c.id)).rejects.toThrow(/하위 폴더/);
    await expect(storage.folders.move(a.id, a.id)).rejects.toThrow(/자기 자신/);
    await expect(storage.folders.move(a.id, 'nope')).rejects.toThrow(/대상 폴더/);

    const moved = await storage.folders.move(c.id, ROOT_FOLDER_ID);
    expect(moved.parentId).toBe(ROOT_FOLDER_ID);
    expect(await storage.folders.children(ROOT_FOLDER_ID)).toHaveLength(2);
  });

  it('enforces the maximum nesting depth', async () => {
    let parentId: string = ROOT_FOLDER_ID;
    for (let depth = 1; depth <= 5; depth++) {
      const f = await storage.folders.put(
        createFolder({ name: `d${depth}`, sortKey: 'a0', parentId }),
      );
      parentId = f.id;
    }
    await expect(
      storage.folders.put(createFolder({ name: 'too deep', sortKey: 'a0', parentId })),
    ).rejects.toThrow(/최대/);
  });
});

describe('documents and pdf blobs', () => {
  it('refCount follows document references and the blob is dropped at zero', async () => {
    await storage.blobs.put(HASH_A, pdfBlob('pdf-a'));
    expect((await storage.blobs.info(HASH_A))?.refCount).toBe(0);

    const d1 = await storage.documents.put(doc(HASH_A, '하나'));
    const d2 = await storage.documents.put(doc(HASH_A, '둘'));
    expect((await storage.blobs.info(HASH_A))?.refCount).toBe(2);
    expect((await storage.documents.byBlobHash(HASH_A)).map((d) => d.title).sort()).toEqual([
      '둘',
      '하나',
    ]);

    await storage.documents.softDelete(d1.id);
    expect((await storage.blobs.info(HASH_A))?.refCount).toBe(2);

    await storage.documents.purge(d1.id);
    expect((await storage.blobs.info(HASH_A))?.refCount).toBe(1);

    await storage.documents.purge(d2.id);
    expect(await storage.blobs.has(HASH_A)).toBe(false);
  });

  it('moves the reference when a document points at a different blob', async () => {
    await storage.blobs.put(HASH_A, pdfBlob('a'));
    await storage.blobs.put(HASH_B, pdfBlob('b'));
    const d = await storage.documents.put(doc(HASH_A));
    await storage.documents.put({ ...d, blobHash: HASH_B });
    expect(await storage.blobs.has(HASH_A)).toBe(false);
    expect((await storage.blobs.info(HASH_B))?.refCount).toBe(1);
  });

  it('refuses a document whose blob was never stored', async () => {
    await expect(storage.documents.put(doc(HASH_B))).rejects.toThrow(/not found/);
    expect(await storage.documents.get((await storage.documents.trashed())[0]?.id ?? 'x')).toBe(
      undefined,
    );
  });

  it('stores and returns the blob bytes', async () => {
    await storage.blobs.put(HASH_A, pdfBlob('hello pdf'));
    const blob = await storage.blobs.get(HASH_A);
    expect(await blob?.text()).toBe('hello pdf');
    expect(await storage.blobs.pruneOrphans()).toBe(1);
    expect(await storage.blobs.has(HASH_A)).toBe(false);
  });

  it('lists documents in a folder and recent documents', async () => {
    await storage.blobs.put(HASH_A, pdfBlob('a'));
    const folder = await storage.folders.put(createFolder({ name: 'f', sortKey: 'a0' }));
    const inFolder = await storage.documents.put({ ...doc(HASH_A, 'in'), folderId: folder.id });
    const atRoot = await storage.documents.put(doc(HASH_A, 'root'));

    expect((await storage.documents.inFolder(folder.id)).map((d) => d.id)).toEqual([inFolder.id]);
    expect((await storage.documents.inFolder(ROOT_FOLDER_ID)).map((d) => d.id)).toEqual([
      atRoot.id,
    ]);

    expect(await storage.documents.recent(5)).toHaveLength(0);
    await storage.documents.put({ ...atRoot, lastOpenedAt: '2026-09-21T01:00:00.000Z' });
    await storage.documents.put({ ...inFolder, lastOpenedAt: '2026-09-21T02:00:00.000Z' });
    expect((await storage.documents.recent(5)).map((d) => d.title)).toEqual(['in', 'root']);
  });
});

describe('annotations', () => {
  it('page() uses the compound index and orders by z', async () => {
    await storage.blobs.put(HASH_A, pdfBlob('a'));
    const d = await storage.documents.put(doc(HASH_A));

    await storage.annotations.bulkPut([ink(d.id, 0, 2), ink(d.id, 0, 1), ink(d.id, 1, 0)]);
    const page0 = await storage.annotations.page(d.id, 0);
    expect(page0.map((a) => a.z)).toEqual([1, 2]);
    expect(page0.every((a) => a.rev === 1)).toBe(true);
    expect(await storage.annotations.page(d.id, 1)).toHaveLength(1);
    expect(await storage.annotations.page(d.id, 2)).toHaveLength(0);
    expect(await storage.annotations.forDocument(d.id)).toHaveLength(3);

    expect(await storage.annotations.purgeForDocument(d.id)).toBe(3);
    expect(await storage.annotations.forDocument(d.id)).toHaveLength(0);
  });
});

describe('settings and stats', () => {
  it('round-trips arbitrary settings values', async () => {
    await storage.settings.set('pen.default', { color: '#112233', width: 2 });
    expect(await storage.settings.get('pen.default')).toEqual({ color: '#112233', width: 2 });
    await storage.settings.remove('pen.default');
    expect(await storage.settings.get('pen.default')).toBeUndefined();
  });

  it('reports counts and pdf bytes', async () => {
    await storage.blobs.put(HASH_A, pdfBlob('12345'));
    await storage.documents.put(doc(HASH_A));
    await storage.folders.put(createFolder({ name: 'f', sortKey: 'a0' }));
    const stats = await storage.stats();
    expect(stats).toMatchObject({
      folders: 1,
      documents: 1,
      pdfBlobs: 1,
      annotations: 0,
      outboxPending: 2,
      pdfBytes: 5,
    });
  });
});

describe('transaction', () => {
  it('rolls back every write when the callback throws', async () => {
    await expect(
      storage.transaction(async () => {
        await storage.folders.put(createFolder({ name: 'ghost', sortKey: 'a0' }));
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    expect(await storage.folders.children(ROOT_FOLDER_ID)).toHaveLength(0);
    expect(await storage.outbox.count()).toBe(0);
  });

  it('acks outbox entries up to a sequence number', async () => {
    await storage.folders.put(createFolder({ name: 'a', sortKey: 'a0' }));
    await storage.folders.put(createFolder({ name: 'b', sortKey: 'a1' }));
    const [first] = await storage.outbox.pending(10);
    await storage.outbox.ack(first.seq);
    expect(await storage.outbox.count()).toBe(1);
  });
});
