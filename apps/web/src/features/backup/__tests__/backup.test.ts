import 'fake-indexeddb/auto';
import {
  ANNOTATION_SCHEMA_VERSION,
  ROOT_FOLDER_ID,
  createAnnotationBase,
  createFolder,
  createPdfDocument,
  type InkObject,
} from '@pdf-memo/shared';
import { strToU8, zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDeviceId } from '../../../lib/deviceId';
import { sha256Hex } from '../../../lib/hash';
import { DexieStorage } from '../../../storage/dexie/DexieStorage';
import { createBackup } from '../createBackup';
import { backupFileName, parseEntryName } from '../format';
import { BackupFormatError, mergeDecision, restoreBackup } from '../restoreBackup';

let source: DexieStorage;
let target: DexieStorage;

function ink(documentId: string, pageIndex: number, z: number): InkObject {
  return {
    ...createAnnotationBase(documentId, pageIndex, z, [0, 0, 10, 10]),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    type: 'ink',
    tool: 'pen',
    color: '#123456',
    opacity: 1,
    width: 2,
    points: [1, 1, 0.5, 5, 5, 0.6],
    smoothing: { thinning: 0.6, streamline: 0.5, smoothing: 0.5 },
  };
}

async function seedSource() {
  const pdfBytes = new TextEncoder().encode('%PDF-1.4 fake pdf bytes for backup test');
  const hash = await sha256Hex(pdfBytes);
  await source.blobs.put(hash, new Blob([pdfBytes], { type: 'application/pdf' }));

  const parent = await source.folders.put(createFolder({ name: '부모', sortKey: 'a0' }));
  const child = await source.folders.put(
    createFolder({ name: '자식', sortKey: 'a0', parentId: parent.id }),
  );
  const trashedFolder = await source.folders.put(
    createFolder({ name: '지운 폴더', sortKey: 'a1' }),
  );
  await source.folders.softDelete(trashedFolder.id);

  await source.assets.put({
    id: 'thumb-1',
    kind: 'thumbnail',
    mime: 'image/jpeg',
    width: 24,
    height: 32,
    byteSize: 4,
    createdAt: new Date().toISOString(),
    ownerId: null,
    data: new Blob(['jpeg'], { type: 'image/jpeg' }),
  });
  const doc = createPdfDocument({
    title: '레시피',
    originalFileName: 'recipe.pdf',
    blobHash: hash,
    byteSize: pdfBytes.byteLength,
    pageCount: 1,
    pageSizes: [{ w: 595, h: 842, rotation: 0 }],
    sortKey: 'a0',
    folderId: child.id,
  });
  doc.thumbnailAssetId = 'thumb-1';
  const savedDoc = await source.documents.put(doc);
  const second = await source.documents.put(
    createPdfDocument({
      title: '같은 PDF',
      originalFileName: 'recipe-copy.pdf',
      blobHash: hash,
      byteSize: pdfBytes.byteLength,
      pageCount: 1,
      pageSizes: [{ w: 595, h: 842, rotation: 0 }],
      sortKey: 'a1',
      folderId: ROOT_FOLDER_ID,
    }),
  );

  const alive = ink(savedDoc.id, 0, 1);
  const gone = ink(savedDoc.id, 0, 2);
  await source.annotations.bulkPut([alive, gone]);
  await source.annotations.softDelete(gone.id);
  await source.settings.set('tools.v1', { tool: 'marker' });
  await source.settings.set('backup.lastAt', '2020-01-01T00:00:00.000Z');

  return { hash, pdfBytes, parent, child, trashedFolder, doc: savedDoc, second, alive, gone };
}

beforeEach(() => {
  source = new DexieStorage(`bk-src-${Math.random().toString(36).slice(2)}`);
  target = new DexieStorage(`bk-dst-${Math.random().toString(36).slice(2)}`);
});

afterEach(async () => {
  await source.destroy();
  await target.destroy();
});

describe('format helpers', () => {
  it('parses entry names and rejects malformed ids', () => {
    expect(parseEntryName('manifest.json')).toEqual({ kind: 'manifest' });
    expect(parseEntryName('pdfs/' + 'a'.repeat(64) + '.pdf')).toEqual({
      kind: 'pdf',
      hash: 'a'.repeat(64),
    });
    expect(parseEntryName('pdfs/short.pdf')).toEqual({ kind: 'unknown' });
    expect(parseEntryName('annotations/01a0c69a-b833-7434-b143-ea94aec704b7.json')).toEqual({
      kind: 'annotations',
      documentId: '01a0c69a-b833-7434-b143-ea94aec704b7',
    });
    expect(parseEntryName('assets/pack%3Abasic%2Fstar')).toEqual({
      kind: 'asset',
      assetId: 'pack:basic/star',
    });
    expect(parseEntryName('__MACOSX/x')).toEqual({ kind: 'unknown' });
    expect(backupFileName(new Date(2026, 8, 22, 15, 30))).toBe(
      'ALL READ MEMO 백업 2026-09-22 1530.pdfmemo.zip',
    );
  });

  it('applies last-writer-wins on updatedAt', () => {
    const older = { updatedAt: '2026-01-01T00:00:00.000Z' } as never;
    const newer = { updatedAt: '2026-02-01T00:00:00.000Z' } as never;
    expect(mergeDecision(undefined, newer)).toBe('add');
    expect(mergeDecision(older, newer)).toBe('update');
    expect(mergeDecision(newer, older)).toBe('skip');
    expect(mergeDecision(newer, newer)).toBe('skip');
  });

  it('keeps a stable anonymous device id', async () => {
    const first = await getDeviceId(source);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await getDeviceId(source)).toBe(first);
  });
});

describe('backup round trip', () => {
  it('restores folders, documents, annotations, assets, pdf bytes and settings into an empty store', async () => {
    const seed = await seedSource();
    const progress: string[] = [];
    const backup = await createBackup(source, '0.1.0-test', (p) => progress.push(p.phase));

    expect(backup.file.name.endsWith('.pdfmemo.zip')).toBe(true);
    expect(backup.manifest.counts).toEqual({
      folders: 3,
      documents: 2,
      annotations: 2,
      assets: 1,
      pdfs: 1,
    });
    expect(backup.warnings).toEqual([]);
    expect(progress).toContain('PDF 원본');
    expect(await source.settings.get<string>('backup.lastAt')).toBe(backup.manifest.exportedAt);

    const summary = await restoreBackup(target, backup.file);
    expect(summary.manifest.deviceId).toBe(await getDeviceId(source));
    expect(summary.folders).toEqual({ added: 3, updated: 0, skipped: 0, invalid: 0 });
    expect(summary.documents).toEqual({ added: 2, updated: 0, skipped: 0, invalid: 0 });
    expect(summary.annotations).toEqual({ added: 2, updated: 0, skipped: 0, invalid: 0 });
    expect(summary.pdfs).toEqual({ added: 1, skipped: 0, invalid: 0 });
    expect(summary.assets).toEqual({ added: 1, skipped: 0, invalid: 0 });
    expect(summary.settings).toEqual({ added: 1, skipped: 0 });
    expect(summary.warnings).toEqual([]);

    const child = await target.folders.get(seed.child.id);
    expect(child?.parentId).toBe(seed.parent.id);
    expect((await target.folders.get(seed.trashedFolder.id))?.deletedAt).not.toBeNull();
    expect((await target.documents.get(seed.doc.id))?.folderId).toBe(seed.child.id);
    expect((await target.blobs.info(seed.hash))?.refCount).toBe(2);
    expect(new Uint8Array(await (await target.blobs.get(seed.hash))!.arrayBuffer())).toEqual(
      seed.pdfBytes,
    );
    expect((await target.assets.get('thumb-1'))?.width).toBe(24);
    expect(await target.annotations.page(seed.doc.id, 0)).toHaveLength(1);
    expect((await target.annotations.get(seed.gone.id))?.deletedAt).not.toBeNull();
    expect(await target.settings.get('tools.v1')).toEqual({ tool: 'marker' });
    expect(await target.settings.get('backup.lastAt')).toBeUndefined();

    // 같은 백업을 다시 복원하면 전부 건너뛴다
    const again = await restoreBackup(target, backup.file);
    expect(again.folders).toEqual({ added: 0, updated: 0, skipped: 3, invalid: 0 });
    expect(again.documents.skipped).toBe(2);
    expect(again.annotations.skipped).toBe(2);
    expect(again.pdfs).toEqual({ added: 0, skipped: 1, invalid: 0 });
  });

  it('lets the newer side win when merging into a store that already has the item', async () => {
    const seed = await seedSource();
    const backup = await createBackup(source, '0.1.0-test');
    await restoreBackup(target, backup.file);

    // 대상에서 나중에 이름을 바꾸면(더 새로움) 오래된 백업이 덮어쓰지 못한다
    const local = (await target.documents.get(seed.doc.id))!;
    await target.documents.put({ ...local, title: '로컬에서 바꾼 제목' });
    const summary = await restoreBackup(target, backup.file);
    expect(summary.documents.skipped).toBe(2);
    expect((await target.documents.get(seed.doc.id))?.title).toBe('로컬에서 바꾼 제목');

    // 원본에서 더 나중에 바꾸고 새 백업을 만들면 대상이 갱신된다
    const remote = (await source.documents.get(seed.doc.id))!;
    await new Promise((r) => setTimeout(r, 5));
    await source.documents.put({ ...remote, title: '원본에서 바꾼 제목' });
    const newer = await createBackup(source, '0.1.0-test');
    const second = await restoreBackup(target, newer.file);
    expect(second.documents.updated).toBe(1);
    expect((await target.documents.get(seed.doc.id))?.title).toBe('원본에서 바꾼 제목');
  });

  it('skips documents whose pdf is missing and reparents orphan folders to root', async () => {
    const orphanParentId = '01a0c69a-b833-7434-b143-ea94aec7ffff';
    const folder = createFolder({ name: '고아', sortKey: 'a0', parentId: orphanParentId });
    const doc = createPdfDocument({
      title: 'PDF 없는 문서',
      originalFileName: 'x.pdf',
      blobHash: 'b'.repeat(64),
      byteSize: 10,
      pageCount: 1,
      pageSizes: [{ w: 100, h: 100, rotation: 0 }],
      sortKey: 'a0',
    });
    const manifest = {
      formatVersion: 1,
      appVersion: 't',
      annotationSchemaVersion: ANNOTATION_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      deviceId: 'dev',
      counts: { folders: 1, documents: 1, annotations: 0, assets: 0, pdfs: 0 },
    };
    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(manifest)),
      'folders.json': strToU8(JSON.stringify([folder])),
      'documents.json': strToU8(JSON.stringify([doc, { broken: true }])),
      'notes.txt': strToU8('ignored'),
    });

    const summary = await restoreBackup(target, new Blob([zip]));
    expect(summary.folders.added).toBe(1);
    expect((await target.folders.get(folder.id))?.parentId).toBe(ROOT_FOLDER_ID);
    expect(summary.documents).toEqual({ added: 0, updated: 0, skipped: 1, invalid: 1 });
    expect(summary.warnings.some((w) => w.includes('루트로 옮김'))).toBe(true);
    expect(summary.warnings.some((w) => w.includes('PDF 원본이 없어'))).toBe(true);
    expect(summary.warnings.some((w) => w.includes('notes.txt'))).toBe(true);
  });

  it('rejects archives without a valid manifest or from a newer schema', async () => {
    const noManifest = zipSync({ 'folders.json': strToU8('[]') });
    await expect(restoreBackup(target, new Blob([noManifest]))).rejects.toBeInstanceOf(
      BackupFormatError,
    );

    const badManifest = zipSync({ 'manifest.json': strToU8('{"formatVersion": 99}') });
    await expect(restoreBackup(target, new Blob([badManifest]))).rejects.toThrow(
      /인식할 수 없습니다/,
    );

    const future = zipSync({
      'manifest.json': strToU8(
        JSON.stringify({
          formatVersion: 1,
          appVersion: 't',
          annotationSchemaVersion: ANNOTATION_SCHEMA_VERSION + 1,
          exportedAt: new Date().toISOString(),
          deviceId: 'dev',
          counts: { folders: 0, documents: 0, annotations: 0, assets: 0, pdfs: 0 },
        }),
      ),
    });
    await expect(restoreBackup(target, new Blob([future]))).rejects.toThrow(/새로운 버전/);
  });
});
