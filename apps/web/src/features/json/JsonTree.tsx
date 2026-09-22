import { memo, useState, type ReactNode } from 'react';
import {
  CHILD_PAGE,
  childEntries,
  formatPrimitive,
  isContainer,
  joinPath,
  summarize,
  type JsonValue,
} from './model';

export interface TreeContext {
  /** 이 깊이보다 얕은 컨테이너는 기본으로 펼친다 */
  defaultDepth: number;
  /** 사용자가 직접 접거나 펼친 노드 (경로 → 펼침) */
  overrides: ReadonlyMap<string, boolean>;
  onToggle: (path: string, expanded: boolean) => void;
  query: string;
  /** 찾기 결과: 일치 노드와 펼쳐야 하는 조상 */
  matches: ReadonlySet<string> | null;
  expandForFind: ReadonlySet<string> | null;
}

const VALUE_CLASS: Record<string, string> = {
  string: 'text-emerald-700',
  number: 'text-blue-700',
  boolean: 'text-purple-700',
  null: 'text-slate-400 italic',
};

/** query와 일치하는 부분을 강조 */
function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  const q = query.trim().toLowerCase();
  if (!q) return text;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let index = lower.indexOf(q, from);
  let key = 0;
  while (index >= 0 && parts.length < 60) {
    if (index > from) parts.push(text.slice(from, index));
    parts.push(
      <mark key={key++} className="rounded-sm bg-yellow-200 text-inherit">
        {text.slice(index, index + q.length)}
      </mark>,
    );
    from = index + q.length;
    index = lower.indexOf(q, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

interface JsonNodeProps {
  name: string | null;
  value: JsonValue;
  path: string;
  depth: number;
  ctx: TreeContext;
  /** 부모가 배열이면 키를 흐리게 (인덱스) */
  inArray: boolean;
}

const JsonNode = memo(function JsonNode({ name, value, path, depth, ctx, inArray }: JsonNodeProps) {
  const [shown, setShown] = useState(CHILD_PAGE);
  const container = isContainer(value);
  const matched = ctx.matches?.has(path) ?? false;
  const expanded =
    container &&
    (ctx.overrides.get(path) ??
      ((ctx.expandForFind?.has(path) ?? false) || depth < ctx.defaultDepth));

  const keyLabel =
    name !== null ? (
      <span className={inArray ? 'text-slate-400' : 'text-slate-800'}>
        {inArray ? name : <Highlight text={name} query={ctx.query} />}
        <span className="text-slate-400">: </span>
      </span>
    ) : null;

  if (!container) {
    const { text, kind } = formatPrimitive(value);
    return (
      <div
        className={`flex items-start gap-1 rounded px-1 py-0.5 leading-5 ${matched ? 'bg-yellow-50' : ''}`}
        data-json-path={path}
      >
        <span className="w-4 shrink-0" />
        <span className="break-all">
          {keyLabel}
          <span className={VALUE_CLASS[kind]}>
            <Highlight text={text} query={ctx.query} />
          </span>
        </span>
      </div>
    );
  }

  const entries = childEntries(value);
  const visible = expanded ? entries.slice(0, shown) : [];
  const remaining = entries.length - visible.length;
  const isArray = Array.isArray(value);

  return (
    <div data-json-path={path}>
      <div
        className={`flex items-start gap-1 rounded px-1 py-0.5 leading-5 ${matched ? 'bg-yellow-50' : ''}`}
      >
        <button
          type="button"
          onClick={() => ctx.onToggle(path, !expanded)}
          className="w-4 shrink-0 select-none text-slate-500 hover:text-slate-900"
          aria-expanded={expanded}
          aria-label={expanded ? '접기' : '펼치기'}
          data-json-toggle={path}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="break-all">
          {keyLabel}
          {expanded ? (
            <span className="text-slate-500">{isArray ? '[' : '{'}</span>
          ) : (
            <button
              type="button"
              onClick={() => ctx.onToggle(path, true)}
              className="text-slate-500 hover:text-slate-800"
            >
              {summarize(value)}
            </button>
          )}
        </span>
      </div>
      {expanded && (
        <div className="ml-2 border-l border-slate-200 pl-3">
          {visible.map(([key, child]) => (
            <JsonNode
              key={key}
              name={key}
              value={child}
              path={joinPath(path, key)}
              depth={depth + 1}
              ctx={ctx}
              inArray={isArray}
            />
          ))}
          {remaining > 0 && (
            <button
              type="button"
              onClick={() => setShown((n) => n + CHILD_PAGE)}
              className="my-0.5 rounded px-1 text-xs text-indigo-600 hover:bg-indigo-50"
            >
              {Math.min(remaining, CHILD_PAGE)}개 더 보기 (남은 {remaining}개)
            </button>
          )}
          <div className="px-1 leading-5 text-slate-500">{isArray ? ']' : '}'}</div>
        </div>
      )}
    </div>
  );
});

interface JsonTreeProps {
  value: JsonValue;
  ctx: TreeContext;
}

/** 접기/펼치기가 되는 JSON 트리 */
export function JsonTree({ value, ctx }: JsonTreeProps) {
  return (
    <div className="font-mono text-[13px] text-slate-800" data-json-tree>
      <JsonNode name={null} value={value} path="" depth={0} ctx={ctx} inArray={false} />
    </div>
  );
}
