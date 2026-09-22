/** JSON 트리 뷰어의 순수 로직: 값 판별, 요약, 경로, 찾기 */

export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}

export type PrimitiveKind = 'string' | 'number' | 'boolean' | 'null';

/** 한 번에 그리는 자식 수. 큰 배열은 "더 보기"로 늘린다 */
export const CHILD_PAGE = 200;
/** 찾기 결과 상한 (성능) */
export const MAX_MATCHES = 500;

export function isContainer(value: JsonValue): value is JsonValue[] | JsonObject {
  return typeof value === 'object' && value !== null;
}

export function childEntries(value: JsonValue[] | JsonObject): Array<[string, JsonValue]> {
  if (Array.isArray(value)) return value.map((item, index) => [String(index), item]);
  return Object.entries(value);
}

export function childCount(value: JsonValue[] | JsonObject): number {
  return Array.isArray(value) ? value.length : Object.keys(value).length;
}

/** 접힌 컨테이너의 한 줄 요약 */
export function summarize(value: JsonValue[] | JsonObject): string {
  const count = childCount(value);
  if (Array.isArray(value)) return count === 0 ? '[]' : `[…] ${count}개 항목`;
  return count === 0 ? '{}' : `{…} ${count}개 키`;
}

/** JSON Pointer 식 경로 ('/a/0/b'). 키의 '~'와 '/'는 이스케이프한다 */
export function joinPath(parent: string, key: string): string {
  return `${parent}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`;
}

export function formatPrimitive(value: JsonPrimitive): { text: string; kind: PrimitiveKind } {
  if (value === null) return { text: 'null', kind: 'null' };
  if (typeof value === 'string') return { text: JSON.stringify(value), kind: 'string' };
  if (typeof value === 'boolean') return { text: String(value), kind: 'boolean' };
  return { text: String(value), kind: 'number' };
}

export interface FindResult {
  /** 키 또는 값이 일치한 노드 경로 */
  matches: Set<string>;
  /** 일치 노드를 보이게 하려고 펼쳐야 하는 조상 경로 (루트 '' 포함) */
  expand: Set<string>;
  /** 상한에 걸리기 전까지 센 일치 수 */
  total: number;
  truncated: boolean;
}

/** 대소문자 구분 없이 키·기본값 문자열에 query가 들어가는 노드를 찾는다 */
export function findMatches(root: JsonValue, query: string, limit = MAX_MATCHES): FindResult {
  const q = query.trim().toLowerCase();
  const result: FindResult = { matches: new Set(), expand: new Set(), total: 0, truncated: false };
  if (q.length === 0) return result;

  const visit = (value: JsonValue, path: string, key: string | null, ancestors: string[]) => {
    if (result.matches.size >= limit) {
      result.truncated = true;
      return;
    }
    let hit = key !== null && key.toLowerCase().includes(q);
    if (!isContainer(value)) {
      const text = value === null ? 'null' : String(value);
      if (text.toLowerCase().includes(q)) hit = true;
    }
    if (hit) {
      result.matches.add(path);
      result.total += 1;
      for (const ancestor of ancestors) result.expand.add(ancestor);
    }
    if (isContainer(value)) {
      const next = [...ancestors, path];
      for (const [childKey, child] of childEntries(value)) {
        visit(child, joinPath(path, childKey), childKey, next);
        if (result.truncated) return;
      }
    }
  };
  visit(root, '', null, []);
  return result;
}

export function toPrettyJson(value: JsonValue): string {
  return JSON.stringify(value, null, 2);
}

/** JSON.parse 오류 메시지를 사람이 읽을 문장으로 (위치가 있으면 줄·열을 덧붙인다) */
export function describeJsonError(error: unknown, text: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const at = /position (\d+)/i.exec(message);
  if (!at) return `JSON을 읽을 수 없습니다: ${message}`;
  const offset = Number(at[1]);
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - before.lastIndexOf('\n');
  return `JSON 문법 오류 (${line}행 ${column}열): ${message}`;
}
