import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { formatBytes } from '../../lib/quota';
import { formatDateTime, formatRelative } from '../../lib/format';
import { storage } from '../../storage';
import { canShareFiles, downloadFile, shareFile } from '../export/download';
import { createBackup } from './createBackup';
import { SETTINGS_LAST_BACKUP } from './format';
import { restoreBackup, type RestoreSummary } from './restoreBackup';

type Busy = 'backup' | 'restore' | null;

interface PanelState {
  busy: Busy;
  progress: string | null;
  error: string | null;
  info: string | null;
  summary: RestoreSummary | null;
}

const IDLE: PanelState = { busy: null, progress: null, error: null, info: null, summary: null };

/** 설정 화면의 백업 카드: 백업 파일 만들기(저장·공유)와 복원(병합) */
export function BackupPanel() {
  const [lastAt, setLastAt] = useState<string | null>(null);
  const [state, setState] = useState<PanelState>(IDLE);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const shareable = canShareFiles();

  useEffect(() => {
    storage.settings
      .get<string>(SETTINGS_LAST_BACKUP)
      .then((value) => setLastAt(value ?? null))
      .catch((error: unknown) => console.error('[BackupPanel]', error));
  }, []);

  async function onBackup(action: 'download' | 'share') {
    if (state.busy) return;
    setState({ ...IDLE, busy: 'backup', progress: '준비 중…' });
    try {
      const result = await createBackup(storage, __APP_VERSION__, (p) =>
        setState((s) => ({ ...s, progress: `${p.phase} ${p.done}/${p.total}` })),
      );
      let info: string;
      if (action === 'share') {
        const shared = await shareFile(result.file, result.file.name);
        info = shared ? '백업 파일을 공유했습니다' : '공유를 취소했습니다';
      } else {
        downloadFile(result.file);
        info = `${result.file.name} (${formatBytes(result.file.size)}) 저장`;
      }
      setLastAt(result.manifest.exportedAt);
      const warn = result.warnings.length > 0 ? ` · 경고 ${result.warnings.length}건` : '';
      setState({ ...IDLE, info: info + warn });
    } catch (error) {
      setState({ ...IDLE, error: error instanceof Error ? error.message : String(error) });
    }
  }

  async function onRestoreFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || state.busy) return;
    if (
      !window.confirm(`"${file.name}"을(를) 복원할까요?\n기존 데이터는 지워지지 않고 병합됩니다.`)
    )
      return;
    setState({ ...IDLE, busy: 'restore', progress: '백업 파일 읽는 중…' });
    try {
      const summary = await restoreBackup(storage, file, (p) =>
        setState((s) => ({ ...s, progress: p.detail ? `${p.phase} (${p.detail})` : p.phase })),
      );
      setState({ ...IDLE, summary });
    } catch (error) {
      setState({ ...IDLE, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm" id="backup">
      <h2 className="font-semibold">백업</h2>
      <p className="mt-2 text-slate-600">
        폴더·문서·필기·썸네일·PDF 원본을 zip 한 파일로 저장합니다. 브라우저 저장소가 지워졌을 때
        되돌릴 수 있는 유일한 방법이니 주기적으로 만들어 두세요. 복원은 병합 방식이라 기존 데이터는
        그대로 두고 없는 항목만 추가합니다.
      </p>
      <p className="mt-2 text-xs text-slate-500">
        마지막 백업:{' '}
        {lastAt ? (
          <span title={formatDateTime(lastAt)}>{formatRelative(lastAt)}</span>
        ) : (
          <span className="text-amber-600">아직 없음</span>
        )}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onBackup('download')}
          disabled={state.busy !== null}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {state.busy === 'backup' ? '백업 만드는 중…' : '백업 파일 만들기'}
        </button>
        {shareable && (
          <button
            type="button"
            onClick={() => void onBackup('share')}
            disabled={state.busy !== null}
            className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
          >
            백업 공유…
          </button>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={state.busy !== null}
          className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-50"
        >
          {state.busy === 'restore' ? '복원 중…' : '백업 복원…'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip,application/zip"
          hidden
          onChange={(e) => void onRestoreFile(e)}
          data-backup-input
        />
      </div>

      {state.progress && <p className="mt-3 text-amber-600">{state.progress}</p>}
      {state.error && <p className="mt-3 text-red-600">오류: {state.error}</p>}
      {state.info && <p className="mt-3 text-emerald-600">{state.info}</p>}
      {state.summary && <RestoreSummaryView summary={state.summary} />}
    </section>
  );
}

function RestoreSummaryView({ summary }: { summary: RestoreSummary }) {
  const rows: Array<[string, string]> = [
    ['폴더', mergeText(summary.folders)],
    ['문서', mergeText(summary.documents)],
    ['필기', mergeText(summary.annotations)],
    ['PDF 원본', `추가 ${summary.pdfs.added} · 이미 있음 ${summary.pdfs.skipped}`],
    ['썸네일·자산', `추가 ${summary.assets.added} · 이미 있음 ${summary.assets.skipped}`],
    ['설정', `추가 ${summary.settings.added} · 유지 ${summary.settings.skipped}`],
  ];
  return (
    <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3" role="status">
      <p className="font-medium text-emerald-800">
        복원 완료 · 백업 시각 {formatDateTime(summary.manifest.exportedAt)}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs text-slate-700">
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-slate-500">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {summary.warnings.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs text-amber-700">
          {summary.warnings.slice(0, 5).map((w) => (
            <li key={w}>{w}</li>
          ))}
          {summary.warnings.length > 5 && <li>외 {summary.warnings.length - 5}건</li>}
        </ul>
      )}
    </div>
  );
}

function mergeText(c: {
  added: number;
  updated: number;
  skipped: number;
  invalid: number;
}): string {
  const parts = [`추가 ${c.added}`, `갱신 ${c.updated}`, `건너뜀 ${c.skipped}`];
  if (c.invalid > 0) parts.push(`손상 ${c.invalid}`);
  return parts.join(' · ');
}
