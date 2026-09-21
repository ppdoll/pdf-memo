import { useEffect, useState } from 'react';
import type { Subscribable } from '../storage/ports';

/**
 * Storage 포트의 Subscribable(Dexie liveQuery 등)을 React 상태로 연결한다.
 * source는 호출 측에서 useMemo로 고정해야 재구독이 반복되지 않는다.
 */
export function useSubscribable<T>(source: Subscribable<T>, initial: T): T {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    const subscription = source.subscribe({
      next: setValue,
      error: (error) => console.error('[useSubscribable]', error),
    });
    return () => subscription.unsubscribe();
  }, [source]);

  return value;
}
