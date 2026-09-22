import type { AnnotationObject } from '@pdf-memo/shared';
import { useCallback, useSyncExternalStore } from 'react';
import type { AnnotationSession } from '../annotate/session';
import { useSelectionStore } from './selectionStore';

const noop = () => {};

/** 현재 선택된 텍스트·노트 객체 (세션 캐시에서 구독) */
export function useSelectedObject(session: AnnotationSession): AnnotationObject | null {
  const selected = useSelectionStore((s) => s.selected);
  const subscribe = useCallback(
    (listener: () => void) =>
      selected ? session.subscribePage(selected.pageIndex, listener) : noop,
    [session, selected],
  );
  const getSnapshot = useCallback(
    () =>
      selected
        ? (session.getPage(selected.pageIndex).find((o) => o.id === selected.id) ?? null)
        : null,
    [session, selected],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
