import type { AnnotationObject } from '@pdf-memo/shared';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { AnnotationSession, SessionStatus } from './session';

/** 한 페이지의 주석 객체를 세션 캐시에서 구독한다 (처음 마운트 시 로드) */
export function usePageObjects(
  session: AnnotationSession,
  pageIndex: number,
): readonly AnnotationObject[] {
  const subscribe = useCallback(
    (listener: () => void) => session.subscribePage(pageIndex, listener),
    [session, pageIndex],
  );
  const getSnapshot = useCallback(() => session.getPage(pageIndex), [session, pageIndex]);

  useEffect(() => {
    void session.ensureLoaded(pageIndex);
  }, [session, pageIndex]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useSessionStatus(session: AnnotationSession): SessionStatus {
  const subscribe = useCallback(
    (listener: () => void) => session.subscribeStatus(listener),
    [session],
  );
  const getSnapshot = useCallback(() => session.status, [session]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
