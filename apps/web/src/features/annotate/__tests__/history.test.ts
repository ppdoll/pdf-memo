import { ANNOTATION_SCHEMA_VERSION, createAnnotationBase, type InkObject } from '@pdf-memo/shared';
import { describe, expect, it } from 'vitest';
import { HistoryStack, invertChange, invertEntry } from '../history';

function ink(z: number): InkObject {
  return {
    ...createAnnotationBase('01a0c69a-b833-7434-b143-ea94aec704b7', 0, z, [0, 0, 1, 1]),
    schemaVersion: ANNOTATION_SCHEMA_VERSION,
    type: 'ink',
    tool: 'pen',
    color: '#000000',
    opacity: 1,
    width: 2,
    points: [0, 0, 0.5, 1, 1, 0.5],
    smoothing: { thinning: 0.5, streamline: 0.5, smoothing: 0.5 },
  };
}

describe('invertChange', () => {
  it('flips add/remove and swaps update sides', () => {
    const a = ink(1);
    const b = { ...a, color: '#ff0000' };
    expect(invertChange({ kind: 'add', object: a })).toEqual({ kind: 'remove', object: a });
    expect(invertChange({ kind: 'remove', object: a })).toEqual({ kind: 'add', object: a });
    expect(invertChange({ kind: 'update', before: a, after: b })).toEqual({
      kind: 'update',
      before: b,
      after: a,
    });
  });

  it('inverts an entry in reverse order', () => {
    const a = ink(1);
    const b = ink(2);
    const inverted = invertEntry({
      label: 'x',
      changes: [
        { kind: 'add', object: a },
        { kind: 'add', object: b },
      ],
    });
    expect(inverted.changes.map((c) => (c.kind === 'remove' ? c.object.z : -1))).toEqual([2, 1]);
  });
});

describe('HistoryStack', () => {
  it('undoes and redoes in order and drops the future on a new push', () => {
    const stack = new HistoryStack();
    const first = { label: '1', changes: [{ kind: 'add' as const, object: ink(1) }] };
    const second = { label: '2', changes: [{ kind: 'add' as const, object: ink(2) }] };
    stack.push(first);
    stack.push(second);
    expect(stack.canUndo).toBe(true);
    expect(stack.canRedo).toBe(false);

    expect(stack.undo()).toBe(second);
    expect(stack.canRedo).toBe(true);
    expect(stack.redo()).toBe(second);
    expect(stack.undo()).toBe(second);
    expect(stack.undo()).toBe(first);
    expect(stack.undo()).toBeUndefined();

    stack.redo();
    stack.push({ label: '3', changes: [] });
    expect(stack.canRedo).toBe(false);
  });

  it('keeps at most `limit` entries', () => {
    const stack = new HistoryStack(2);
    for (let i = 0; i < 5; i += 1) stack.push({ label: String(i), changes: [] });
    expect(stack.undo()?.label).toBe('4');
    expect(stack.undo()?.label).toBe('3');
    expect(stack.undo()).toBeUndefined();
  });
});
