/** 설치 배너를 언제 보일지 정하는 순수 규칙 */

export type InstallPlatform = 'chromium' | 'ios' | 'unsupported';

export const INSTALL_DISMISS_KEY = 'pwa.installDismissedAt';
/** "나중에"를 누르면 이 기간 동안 다시 묻지 않는다 */
export const INSTALL_DISMISS_DAYS = 14;

interface StandaloneProbe {
  matchMedia?: (query: string) => { matches: boolean };
  /** iOS Safari의 navigator.standalone. 표준 Navigator 타입에는 없어 unknown으로 받는다 */
  navigator?: unknown;
}

/** 이미 홈 화면에서 앱처럼 열렸는지 (Chromium display-mode, iOS navigator.standalone) */
export function isStandaloneDisplay(win: StandaloneProbe): boolean {
  if (win.matchMedia?.('(display-mode: standalone)').matches) return true;
  if (win.matchMedia?.('(display-mode: fullscreen)').matches) return true;
  return (win.navigator as { standalone?: boolean } | undefined)?.standalone === true;
}

/**
 * iOS Safari는 beforeinstallprompt가 없어 안내만 보여 준다.
 * 그 밖에는 브라우저가 설치 이벤트를 준 경우에만 버튼을 보인다.
 */
export function detectInstallPlatform(userAgent: string, hasPromptEvent: boolean): InstallPlatform {
  if (hasPromptEvent) return 'chromium';
  if (/iphone|ipad|ipod/i.test(userAgent)) return 'ios';
  return 'unsupported';
}

export interface InstallBannerInput {
  standalone: boolean;
  installed: boolean;
  platform: InstallPlatform;
  /** 마지막으로 "나중에"를 누른 시각 (ISO), 없으면 null */
  dismissedAt: string | null;
  now: Date;
}

export function shouldShowInstallBanner(input: InstallBannerInput): boolean {
  if (input.standalone || input.installed) return false;
  if (input.platform === 'unsupported') return false;
  if (!input.dismissedAt) return true;
  const dismissed = Date.parse(input.dismissedAt);
  if (Number.isNaN(dismissed)) return true;
  const elapsedDays = (input.now.getTime() - dismissed) / (24 * 60 * 60 * 1000);
  return elapsedDays >= INSTALL_DISMISS_DAYS;
}
