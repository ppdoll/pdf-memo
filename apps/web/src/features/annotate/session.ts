import type { AnnotationObject } from '@pdf-memo/shared';
import type { Storage } from '../../storage/ports';
import { HistoryStack, invertEntry, type HistoryEntry, type ObjectChange } from './history';

export interface SessionStatus {
  canUndo: boolean;
  canRedo: boolean;
  /** 아직 IndexedDB에 반영되지 않은 쓰기 수 */
  pending: number;
  error: string | null;
}

const EMPTY: readonly AnnotationObject[] = Object.freeze([]);

/**
 * 문서 하나의 주석 세션.
 * - 페이지별 객체 캐시가 UI의 진실. 변경은 캐시에 즉시 반영하고 저장은 큐로 순서대로 처리한다.
 * - Undo/Redo는 변경 묶음을 뒤집어 같은 경로로 적용한다.
 * - 삭제는 소프트 삭제(tombstone)라 되돌리기가 restore와 같다.
 */
export class AnnotationSession {
  private pages = new Map<number, readonly AnnotationObject[]>();
  private loading = new Map<number, Promise<void>>();
  private pageListeners = new Map<number, Set<() => void>>();
  private statusListeners = new Set<() => void>();
  private history = new HistoryStack();
  private queue: Promise<void> = Promise.resolve();
  private pending = 0;
  private error: string | null = null;
  private statusSnapshot: SessionStatus = {
    canUndo: false,
    canRedo: false,
    pending: 0,
    error: null,
  };
  private disposed = false;

  constructor(
    private readonly storage: Storage,
    readonly documentId: string,
  ) {}

  /** 캐시된 페이지 객체 (z 순). 아직 로드되지 않았으면 빈 배열 */
  getPage(pageIndex: number): readonly AnnotationObject[] {
    return this.pages.get(pageIndex) ?? EMPTY;
  }

  isLoaded(pageIndex: number): boolean {
    return this.pages.has(pageIndex);
  }

  ensureLoaded(pageIndex: number): Promise<void> {
    if (this.pages.has(pageIndex)) return Promise.resolve();
    const inflight = this.loading.get(pageIndex);
    if (inflight) return inflight;
    const task = this.storage.annotations
      .page(this.documentId, pageIndex)
      .then((objects) => {
        if (this.disposed) return;
        // 로드 중에 사용자가 이미 그린 객체가 있으면 합친다
        const drawnMeanwhile = this.pages.get(pageIndex) ?? [];
        const merged = new Map<string, AnnotationObject>();
        for (const o of objects) merged.set(o.id, o);
        for (const o of drawnMeanwhile) merged.set(o.id, o);
        this.setPage(pageIndex, [...merged.values()]);
      })
      .finally(() => this.loading.delete(pageIndex));
    this.loading.set(pageIndex, task);
    return task;
  }

  subscribePage(pageIndex: number, listener: () => void): () => void {
    let set = this.pageListeners.get(pageIndex);
    if (!set) {
      set = new Set();
      this.pageListeners.set(pageIndex, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }

  subscribeStatus(listener: () => void): () => void {
    this.statusListeners.add(listener);
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  get status(): SessionStatus {
    return this.statusSnapshot;
  }

  /** 페이지 안에서 다음 z (맨 위) */
  nextZ(pageIndex: number): number {
    const objects = this.pages.get(pageIndex) ?? EMPTY;
    return objects.reduce((max, o) => Math.max(max, o.z), 0) + 1;
  }

  /** 사용자 동작 하나를 적용·기록·저장한다 */
  commit(label: string, changes: ObjectChange[]): void {
    if (changes.length === 0) return;
    this.applyToCache(changes);
    this.history.push({ label, changes });
    this.persist(changes);
    this.emitStatus();
  }

  undo(): boolean {
    const entry = this.history.undo();
    if (!entry) return false;
    this.applyEntry(invertEntry(entry));
    return true;
  }

  redo(): boolean {
    const entry = this.history.redo();
    if (!entry) return false;
    this.applyEntry(entry);
    return true;
  }

  /** 큐에 남은 쓰기가 모두 끝날 때까지 */
  flush(): Promise<void> {
    return this.queue;
  }

  dispose(): void {
    this.disposed = true;
    this.pageListeners.clear();
    this.statusListeners.clear();
  }

  private applyEntry(entry: HistoryEntry): void {
    this.applyToCache(entry.changes);
    this.persist(entry.changes);
    this.emitStatus();
  }

  private applyToCache(changes: ObjectChange[]): void {
    const touched = new Set<number>();
    for (const change of changes) {
      const pageIndex = change.kind === 'update' ? change.after.pageIndex : change.object.pageIndex;
      const current = this.pages.get(pageIndex) ?? EMPTY;
      let next: AnnotationObject[];
      switch (change.kind) {
        case 'add':
          next = [...current.filter((o) => o.id !== change.object.id), change.object];
          break;
        case 'remove':
          next = current.filter((o) => o.id !== change.object.id);
          break;
        case 'update':
          next = current.map((o) => (o.id === change.after.id ? change.after : o));
          break;
      }
      this.pages.set(pageIndex, sortByZ(next));
      touched.add(pageIndex);
    }
    for (const pageIndex of touched) this.emitPage(pageIndex);
  }

  private persist(changes: ObjectChange[]): void {
    this.pending += changes.length;
    for (const change of changes) {
      this.queue = this.queue
        .then(() => this.write(change))
        .catch((error: unknown) => {
          this.error = error instanceof Error ? error.message : String(error);
          console.error('[AnnotationSession] write failed', error);
        })
        .finally(() => {
          this.pending -= 1;
          this.emitStatus();
        });
    }
  }

  private async write(change: ObjectChange): Promise<void> {
    const repo = this.storage.annotations;
    switch (change.kind) {
      case 'add':
        // 이전에 소프트 삭제된 같은 id가 있어도 put이 rev를 올리며 되살린다
        await repo.put({ ...change.object, deletedAt: null });
        return;
      case 'remove':
        await repo.softDelete(change.object.id);
        return;
      case 'update':
        await repo.put({ ...change.after, deletedAt: null });
        return;
    }
  }

  private setPage(pageIndex: number, objects: AnnotationObject[]): void {
    this.pages.set(pageIndex, sortByZ(objects));
    this.emitPage(pageIndex);
  }

  private emitPage(pageIndex: number): void {
    this.pageListeners.get(pageIndex)?.forEach((listener) => listener());
  }

  private emitStatus(): void {
    this.statusSnapshot = {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      pending: this.pending,
      error: this.error,
    };
    this.statusListeners.forEach((listener) => listener());
  }
}

function sortByZ(objects: readonly AnnotationObject[]): AnnotationObject[] {
  return [...objects].sort((a, b) => a.z - b.z);
}
