export interface LwwStamp {
  /** ISO 8601 UTC. 같은 포맷이라 문자열 비교가 시간 비교와 같다. */
  updatedAt: string;
  deviceId: string;
  rev?: number;
}

export type LwwWinner = 'local' | 'remote';

/**
 * 객체 단위 Last-Writer-Wins.
 * 1) updatedAt이 늦은 쪽 → 2) 같은 시각이면 rev가 큰 쪽 → 3) 그래도 같으면 deviceId 사전순으로 결정론적 선택.
 */
export function resolveLww(local: LwwStamp, remote: LwwStamp): LwwWinner {
  if (local.updatedAt !== remote.updatedAt) {
    return local.updatedAt > remote.updatedAt ? 'local' : 'remote';
  }
  const localRev = local.rev ?? 0;
  const remoteRev = remote.rev ?? 0;
  if (localRev !== remoteRev) {
    return localRev > remoteRev ? 'local' : 'remote';
  }
  if (local.deviceId !== remote.deviceId) {
    return local.deviceId < remote.deviceId ? 'local' : 'remote';
  }
  return 'local';
}
