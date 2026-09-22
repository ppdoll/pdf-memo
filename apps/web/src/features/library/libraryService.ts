import { nowIso, type Folder, type PdfDocument } from '@pdf-memo/shared';
import type { Storage } from '../../storage/ports';

export interface FolderSubtree {
  /** 하위 폴더 전부 (휴지통 포함, 자기 자신 제외) */
  folders: Folder[];
  /** 자기 자신과 하위 폴더 안의 문서 전부 (휴지통 포함) */
  documents: PdfDocument[];
}

/**
 * 폴더·문서의 휴지통 이동/복원/영구 삭제를 하위 항목까지 일관되게 처리한다.
 * 리포지토리는 행 단위 연산만 알고, 계단식 규칙은 여기서 정한다.
 */
export class LibraryService {
  constructor(private readonly storage: Storage) {}

  async subtree(folderId: string): Promise<FolderSubtree> {
    const folders: Folder[] = [];
    const documents: PdfDocument[] = [];
    const queue = [folderId];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      const [kids, docs] = await Promise.all([
        this.storage.folders.children(id, { includeTrashed: true }),
        this.storage.documents.inFolder(id, { includeTrashed: true }),
      ]);
      folders.push(...kids);
      documents.push(...docs);
      queue.push(...kids.map((k) => k.id));
    }
    return { folders, documents };
  }

  /** 폴더와 그 안의 모든 것을 휴지통으로 */
  trashFolder(folderId: string): Promise<void> {
    return this.storage.transaction(async () => {
      const { folders, documents } = await this.subtree(folderId);
      for (const doc of documents)
        if (doc.deletedAt === null) await this.storage.documents.softDelete(doc.id);
      for (const folder of folders)
        if (folder.deletedAt === null) await this.storage.folders.softDelete(folder.id);
      await this.storage.folders.softDelete(folderId);
    });
  }

  /** 폴더와 하위 항목 전부 복원 */
  restoreFolder(folderId: string): Promise<void> {
    return this.storage.transaction(async () => {
      await this.storage.folders.restore(folderId);
      const { folders, documents } = await this.subtree(folderId);
      for (const folder of folders)
        if (folder.deletedAt !== null) await this.storage.folders.restore(folder.id);
      for (const doc of documents)
        if (doc.deletedAt !== null) await this.storage.documents.restore(doc.id);
    });
  }

  /** 폴더와 하위 항목 전부 물리 삭제 */
  purgeFolder(folderId: string): Promise<void> {
    return this.storage.transaction(async () => {
      const { folders, documents } = await this.subtree(folderId);
      for (const doc of documents) await this.purgeDocument(doc.id);
      for (const folder of folders) await this.storage.folders.purge(folder.id);
      await this.storage.folders.purge(folderId);
    });
  }

  trashDocument(documentId: string): Promise<void> {
    return this.storage.documents.softDelete(documentId);
  }

  restoreDocument(documentId: string): Promise<void> {
    return this.storage.documents.restore(documentId);
  }

  /** 주석·썸네일·문서를 지운다. Blob은 마지막 참조가 사라질 때 리포지토리가 정리한다 */
  purgeDocument(documentId: string): Promise<void> {
    return this.storage.transaction(async () => {
      const doc = await this.storage.documents.get(documentId);
      if (!doc) return;
      await this.storage.annotations.purgeForDocument(documentId);
      if (doc.thumbnailAssetId) await this.storage.assets.remove(doc.thumbnailAssetId);
      await this.storage.documents.purge(documentId);
    });
  }

  /** 휴지통의 모든 항목을 물리 삭제 */
  emptyTrash(): Promise<void> {
    return this.storage.transaction(async () => {
      const [folders, documents] = await Promise.all([
        this.storage.folders.trashed(),
        this.storage.documents.trashed(),
      ]);
      for (const doc of documents) await this.purgeDocument(doc.id);
      for (const folder of folders) await this.storage.folders.purge(folder.id);
    });
  }

  async renameDocument(documentId: string, title: string): Promise<void> {
    const doc = await this.storage.documents.get(documentId);
    const next = title.trim();
    if (!doc || next.length === 0 || next === doc.title) return;
    await this.storage.documents.put({ ...doc, title: next.slice(0, 300) });
  }

  async renameFolder(folderId: string, name: string): Promise<void> {
    const folder = await this.storage.folders.get(folderId);
    const next = name.trim();
    if (!folder || next.length === 0 || next === folder.name) return;
    await this.storage.folders.put({ ...folder, name: next.slice(0, 200) });
  }

  /** 문서를 열었을 때. 동기화 대상이 아닌 보기 상태라 rev·outbox를 건드리지 않는다 */
  markOpened(documentId: string): Promise<void> {
    return this.storage.documents.updateViewState(documentId, { lastOpenedAt: nowIso() });
  }

  rememberPage(documentId: string, pageIndex: number): Promise<void> {
    return this.storage.documents.updateViewState(documentId, { lastViewedPage: pageIndex });
  }
}
