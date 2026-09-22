import { newId } from '@pdf-memo/shared';
import type { Storage } from '../storage/ports';

const KEY = 'deviceId';

/**
 * 익명 기기 id. 첫 실행 때 만들어 syncState에 두고 이후 재사용한다.
 * 백업 manifest와 2단계 동기화의 충돌 판정(LWW tie-break)에 쓰인다.
 */
export async function getDeviceId(storage: Storage): Promise<string> {
  const existing = await storage.syncState.get(KEY);
  if (existing) return existing;
  const id = newId();
  await storage.syncState.set(KEY, id);
  return id;
}
