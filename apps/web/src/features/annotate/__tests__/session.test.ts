import 'fake-indexeddb/auto';
import {
  ANNOTATION_SCHEMA_VERSION,
  ROOT_FOLDER_ID,
  createAnnotationBase,
  createPdfDocument,
  type InkObject,
} from '@pdf-memo/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DexieStorage } from '../../../storage/dexie/DexieStorage';
import { AnnotationSession } from '../session';

const HASH = 'd'.repeat(64);

let storage: DexieStorage;
let documentId: string;

function ink(pageIndex: number, z: number): InkObject {
  return {
    ...createAnnotationBase(documentId, pageIndex, z, [0, 0, 10, 10]),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    type: 'ink',
    tool: 'pen',
    color: '#000000',
    opacity: 1,
    width: 2,
    points: [0, 0, 0.5, 10, 10, 0.5],
    smoothing: { thinning: 0.5, streamline: 0.5, smoothing: 0.5 },
  };
}

beforeEach(async () => {
  storage = new DexieStorage(`session-${Math.random().toString(36).slice(2)}`);
  await storage.blobs.put(HASH, new Blob(['pdf']));
  const doc = await storage.documents.put(
    createPdfDocument({
      title: 't',
      originalFileName: 't.pdf',
      blobHash: HASH,
      byteSize: 3,
      pageCount: 2,
      pageSizes: [
        { w: 100, h: 100, rotation: 0 },
        { w: 100, h: 100, rotation: 0 },
      ],
      sortKey: 'a0',
      folderId: ROOT_FOLDER_ID,
    }),
  );
  documentId = doc.id;
});

afterEach(async () => {
  await storage.destroy();
});

describe('AnnotationSession', () => {
  it('adds objects to the cache immediately and persists them in order', async () => {
    const session = new AnnotationSession(storage, documentId);
    const notifications: number[] = [];
    session.subscribePage(0, () => notifications.push(session.getPage(0).length));

    const a = ink(0, session.nextZ(0));
    session.commit('펜', [{ kind: 'add', object: a }]);
    expect(session.getPage(0)).toHaveLength(1);
    expect(session.status.pending).toBe(1);
    expect(notifications).toEqual([1]);

    await session.flush();
    expect(session.status.pending).toBe(0);
    expect(session.status.error).toBeNull();
    const stored = await storage.annotations.page(documentId, 0);
    expect(stored.map((o) => o.id)).toEqual([a.id]);
    expect(stored[0].rev).toBe(1);
    expect(session.nextZ(0)).toBe(a.z + 1);
  });

  it('undo soft-deletes, redo restores, and a new stroke after undo drops the redo branch', async () => {
    const session = new AnnotationSession(storage, documentId);
    const a = ink(0, 1);
    session.commit('펜', [{ kind: 'add', object: a }]);

    expect(session.undo()).toBe(true);
    expect(session.getPage(0)).toHaveLength(0);
    expect(session.status.canUndo).toBe(false);
    expect(session.status.canRedo).toBe(true);
    await session.flush();
    expect(await storage.annotations.page(documentId, 0)).toHaveLength(0);
    expect((await storage.annotations.get(a.id))?.deletedAt).not.toBeNull();

    expect(session.redo()).toBe(true);
    expect(session.getPage(0)).toHaveLength(1);
    await session.flush();
    const restored = await storage.annotations.get(a.id);
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.rev).toBe(3);

    session.undo();
    session.commit('펜', [{ kind: 'add', object: ink(0, 2) }]);
    expect(session.status.canRedo).toBe(false);
    expect(session.redo()).toBe(false);
    await session.flush();
  });

  it('erases several strokes as one undoable batch', async () => {
    const session = new AnnotationSession(storage, documentId);
    const a = ink(0, 1);
    const b = ink(0, 2);
    const c = ink(1, 1);
    session.commit('펜', [{ kind: 'add', object: a }]);
    session.commit('펜', [{ kind: 'add', object: b }]);
    session.commit('펜', [{ kind: 'add', object: c }]);

    session.commit('지우개', [
      { kind: 'remove', object: a },
      { kind: 'remove', object: b },
    ]);
    expect(session.getPage(0)).toHaveLength(0);
    expect(session.getPage(1)).toHaveLength(1);

    session.undo();
    expect(session.getPage(0).map((o) => o.z)).toEqual([1, 2]);
    await session.flush();
    expect(await storage.annotations.page(documentId, 0)).toHaveLength(2);
  });

  it('loads existing objects from storage and merges with strokes drawn meanwhile', async () => {
    const existing = ink(0, 1);
    await storage.annotations.put(existing);
    const session = new AnnotationSession(storage, documentId);

    const loading = session.ensureLoaded(0);
    const fresh = ink(0, 5);
    session.commit('펜', [{ kind: 'add', object: fresh }]);
    await loading;

    expect(session.getPage(0).map((o) => o.z)).toEqual([1, 5]);
    expect(session.isLoaded(0)).toBe(true);
    expect(session.getPage(1)).toEqual([]);
  });

  it('applies updates and reports write errors without breaking the queue', async () => {
    const session = new AnnotationSession(storage, documentId);
    const a = ink(0, 1);
    session.commit('펜', [{ kind: 'add', object: a }]);
    const recolored = { ...a, color: '#ff0000' };
    session.commit('색 변경', [{ kind: 'update', before: a, after: recolored }]);
    await session.flush();
    const updated = await storage.annotations.get(a.id);
    expect(updated?.type === 'ink' ? updated.color : null).toBe('#ff0000');

    session.undo();
    await session.flush();
    const reverted = await storage.annotations.get(a.id);
    expect(reverted?.type === 'ink' ? reverted.color : null).toBe('#000000');
    expect(session.status.error).toBeNull();
  });
});
