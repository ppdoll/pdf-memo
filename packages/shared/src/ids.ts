import { v7 as uuidv7 } from 'uuid';

/** 시간순 정렬이 가능한 UUID v7. 모든 엔티티 id에 사용한다. */
export function newId(): string {
  return uuidv7();
}

/** ISO 8601 UTC 타임스탬프. 문자열 비교로 시간 순서를 판정할 수 있다. */
export function nowIso(): string {
  return new Date().toISOString();
}
