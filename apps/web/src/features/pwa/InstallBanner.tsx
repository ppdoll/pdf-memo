import { nowIso } from '@pdf-memo/shared';
import { useEffect, useState } from 'react';
import { APP_NAME } from '../../app/brand';
import { storage } from '../../storage';
import { promptInstall, useInstallStore } from './installPrompt';
import {
  INSTALL_DISMISS_KEY,
  detectInstallPlatform,
  isStandaloneDisplay,
  shouldShowInstallBanner,
} from './installRules';

/**
 * 홈 화면 추가 안내. Chromium(안드로이드·데스크톱)은 "설치" 버튼으로 바로 띄우고,
 * iOS Safari는 공유 → 홈 화면에 추가 방법을 알려 준다. "나중에"는 14일 동안 숨긴다.
 */
export function InstallBanner() {
  const deferred = useInstallStore((s) => s.deferred);
  const installed = useInstallStore((s) => s.installed);
  /** undefined = 설정을 아직 읽는 중 */
  const [dismissedAt, setDismissedAt] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    storage.settings
      .get<string>(INSTALL_DISMISS_KEY)
      .then((value) => {
        if (!cancelled) setDismissedAt(value ?? null);
      })
      .catch(() => {
        if (!cancelled) setDismissedAt(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (dismissedAt === undefined) return null;
  const platform = detectInstallPlatform(navigator.userAgent, deferred !== null);
  const visible = shouldShowInstallBanner({
    standalone: isStandaloneDisplay(window),
    installed,
    platform,
    dismissedAt,
    now: new Date(),
  });
  if (!visible) return null;

  async function dismiss() {
    const at = nowIso();
    setDismissedAt(at);
    await storage.settings.set(INSTALL_DISMISS_KEY, at);
  }

  async function install() {
    setBusy(true);
    try {
      const outcome = await promptInstall();
      if (outcome === 'dismissed') await dismiss();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm"
      aria-label="앱 설치 안내"
      data-install-banner={platform}
    >
      <img src="/icons/icon-192.png" alt="" className="h-10 w-10 rounded-xl shadow-sm" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-slate-900">홈 화면에 {APP_NAME} 추가</p>
        <p className="text-slate-600">
          {platform === 'ios'
            ? 'Safari 아래 공유 버튼을 누르고 "홈 화면에 추가"를 고르면 앱처럼 열 수 있어요.'
            : '앱처럼 바로 열리고, 인터넷이 없어도 필기할 수 있어요.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {platform === 'chromium' && (
          <button
            type="button"
            onClick={() => void install()}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            data-install-button
          >
            {busy ? '여는 중…' : '설치'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void dismiss()}
          className="rounded-lg px-3 py-1.5 text-slate-600 hover:bg-indigo-100"
          data-install-dismiss
        >
          {platform === 'ios' ? '알겠어요' : '나중에'}
        </button>
      </div>
    </section>
  );
}
