export interface StorageEstimateInfo {
  supported: boolean;
  usage: number | null;
  quota: number | null;
  /** null = 브라우저가 persisted() 를 지원하지 않음 (Safari) */
  persisted: boolean | null;
}

export async function getStorageEstimate(): Promise<StorageEstimateInfo> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { supported: false, usage: null, quota: null, persisted: null };
  }
  const estimate: StorageEstimate =
    typeof navigator.storage.estimate === 'function' ? await navigator.storage.estimate() : {};
  const persisted =
    typeof navigator.storage.persisted === 'function' ? await navigator.storage.persisted() : null;
  return {
    supported: true,
    usage: estimate.usage ?? null,
    quota: estimate.quota ?? null,
    persisted,
  };
}

/** 브라우저에 "이 사이트의 저장소를 비우지 말라"고 요청한다. Chromium·Firefox만 지원 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || typeof navigator.storage?.persist !== 'function') {
    return false;
  }
  return navigator.storage.persist();
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}
