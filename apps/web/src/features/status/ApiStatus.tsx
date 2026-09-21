import type { MetaResponse } from '@pdf-memo/shared';
import { useEffect, useState } from 'react';
import { fetchMeta } from '../../api/client';

type State =
  { kind: 'loading' } | { kind: 'ok'; meta: MetaResponse } | { kind: 'offline'; reason: string };

export function ApiStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchMeta(controller.signal)
      .then((meta) => setState({ kind: 'ok', meta }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setState({ kind: 'offline', reason: e instanceof Error ? e.message : String(e) });
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <h2 className="font-semibold">API</h2>
      {state.kind === 'loading' && <p className="mt-2 text-slate-500">확인 중…</p>}
      {state.kind === 'ok' && (
        <dl className="mt-2 space-y-1 text-slate-600">
          <div className="flex justify-between">
            <dt className="text-slate-500">상태</dt>
            <dd className="text-emerald-600">연결됨</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">버전</dt>
            <dd>
              {state.meta.apiVersion} <span className="text-slate-400">({state.meta.commit})</span>
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-500">클라우드 동기화</dt>
            <dd>{state.meta.features.sync ? '사용 가능' : '2단계 예정'}</dd>
          </div>
        </dl>
      )}
      {state.kind === 'offline' && (
        <p className="mt-2 text-slate-500">
          API에 연결되지 않아 <span className="font-medium text-slate-700">로컬 모드</span>로
          동작합니다. <span className="text-slate-400">({state.reason})</span>
        </p>
      )}
    </section>
  );
}
