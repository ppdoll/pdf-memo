import type { AnnotationObject } from '@pdf-memo/shared';

/** 주석 객체 단위 변경. 한 사용자 동작(스트로크 하나, 지우개 한 번 긋기)은 변경 묶음이 된다 */
export type ObjectChange =
  | { kind: 'add'; object: AnnotationObject }
  | { kind: 'remove'; object: AnnotationObject }
  | { kind: 'update'; before: AnnotationObject; after: AnnotationObject };

export interface HistoryEntry {
  label: string;
  changes: ObjectChange[];
}

export function invertChange(change: ObjectChange): ObjectChange {
  switch (change.kind) {
    case 'add':
      return { kind: 'remove', object: change.object };
    case 'remove':
      return { kind: 'add', object: change.object };
    case 'update':
      return { kind: 'update', before: change.after, after: change.before };
  }
}

export function invertEntry(entry: HistoryEntry): HistoryEntry {
  return { label: entry.label, changes: [...entry.changes].reverse().map(invertChange) };
}

/** 문서 세션 동안만 유지되는 Undo/Redo 스택 */
export class HistoryStack {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];

  constructor(private readonly limit = 200) {}

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** 새 동작이 들어오면 redo 가능했던 미래는 버린다 */
  push(entry: HistoryEntry): void {
    this.past.push(entry);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** 되돌릴 항목을 꺼내 미래 스택으로 옮긴다. 실제 적용은 호출 측이 invertEntry로 */
  undo(): HistoryEntry | undefined {
    const entry = this.past.pop();
    if (entry) this.future.push(entry);
    return entry;
  }

  redo(): HistoryEntry | undefined {
    const entry = this.future.pop();
    if (entry) this.past.push(entry);
    return entry;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
