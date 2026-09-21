import { useCallback, useEffect, useState } from 'react';
import {
  formatBytes,
  getStorageEstimate,
  requestPersistentStorage,
  type StorageEstimateInfo,
} from '../../lib/quota';
import { storage, type StorageStats } from '../../storage';

export function StorageStatus() {
  const [estimate, setEstimate] = useState<StorageEstimateInfo | null>(null);
  const [stats, setStats] = useState<StorageStats | null>(null);

  const load = useCallback(async () => {
    const [e, s] = await Promise.all([getStorageEstimate(), storage.stats()]);
    setEstimate(e);
    setStats(s);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPersist() {
    await requestPersistentStorage();
    await load();
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">로컬 저장소</h2>
        <button
          type="button"
          onClick={() => void load()}
          className="text-xs text-slate-500 hover:text-slate-900"
        >
          새로고침
        </button>
      </div>

      {estimate?.supported === false && (
        <p className="mt-2 text-slate-500">이 브라우저는 저장소 정보를 제공하지 않습니다.</p>
      )}

      {estimate?.supported && (
        <dl className="mt-3 space-y-1.5 text-slate-600">
          <Row label="사용 중">
            {estimate.usage !== null ? formatBytes(estimate.usage) : '-'}
            {estimate.quota !== null && ` / ${formatBytes(estimate.quota)}`}
          </Row>
          <Row label="영구 저장">
            {estimate.persisted === null
              ? '브라우저 미지원'
              : estimate.persisted
                ? '허용됨'
                : '미허용'}
            {estimate.persisted === false && (
              <button
                type="button"
                onClick={onPersist}
                className="ml-2 rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-50"
              >
                요청
              </button>
            )}
          </Row>
        </dl>
      )}

      {stats && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-slate-600">
          <Row label="폴더">{stats.folders}</Row>
          <Row label="문서">{stats.documents}</Row>
          <Row label="주석">{stats.annotations}</Row>
          <Row label="PDF 용량">{formatBytes(stats.pdfBytes)}</Row>
          <Row label="동기화 대기">{stats.outboxPending}</Row>
        </dl>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}
