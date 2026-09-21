import {
  API_PREFIX,
  HealthResponseSchema,
  MetaResponseSchema,
  type HealthResponse,
  type MetaResponse,
} from '@pdf-memo/shared';

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`/${API_PREFIX}/${path}`, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return HealthResponseSchema.parse(await getJson('health', signal));
}

/** 기능 플래그. 실패해도 호출 측은 로컬 모드로 계속 동작해야 한다 */
export async function fetchMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return MetaResponseSchema.parse(await getJson('meta', signal));
}
