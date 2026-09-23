import { useState } from 'react';
import { promptInstall, useInstallStore } from './installPrompt';
import { isStandaloneDisplay } from './installRules';

/** 설정 화면의 설치 안내 한 줄: 설치돼 있으면 상태, 설치 이벤트가 있으면 버튼 */
export function InstallSettingsRow() {
  const deferred = useInstallStore((s) => s.deferred);
  const installed = useInstallStore((s) => s.installed);
  const [busy, setBusy] = useState(false);
  const standalone = isStandaloneDisplay(window);

  if (standalone || installed) {
    return (
      <p className="mt-3 text-emerald-700" data-install-settings="installed">
        ✓ 홈 화면 앱으로 설치되어 있습니다.
      </p>
    );
  }
  if (!deferred) return null;
  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        try {
          await promptInstall();
        } finally {
          setBusy(false);
        }
      }}
      disabled={busy}
      className="mt-3 rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
      data-install-settings="button"
    >
      {busy ? '여는 중…' : '홈 화면에 앱 추가'}
    </button>
  );
}
