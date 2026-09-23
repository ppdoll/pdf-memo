import { describe, expect, it } from 'vitest';
import {
  INSTALL_DISMISS_DAYS,
  detectInstallPlatform,
  isStandaloneDisplay,
  shouldShowInstallBanner,
} from '../installRules';

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36';

describe('detectInstallPlatform', () => {
  it('prefers the browser prompt event, then iOS guidance, else nothing', () => {
    expect(detectInstallPlatform(ANDROID_UA, true)).toBe('chromium');
    expect(detectInstallPlatform(IOS_UA, false)).toBe('ios');
    expect(detectInstallPlatform(ANDROID_UA, false)).toBe('unsupported');
    expect(detectInstallPlatform(IOS_UA, true)).toBe('chromium');
  });
});

describe('isStandaloneDisplay', () => {
  it('detects display-mode media queries and the iOS flag', () => {
    const media = (matching: string) => (query: string) => ({ matches: query === matching });
    expect(isStandaloneDisplay({ matchMedia: media('(display-mode: standalone)') })).toBe(true);
    expect(isStandaloneDisplay({ matchMedia: media('(display-mode: fullscreen)') })).toBe(true);
    expect(
      isStandaloneDisplay({ matchMedia: media('none'), navigator: { standalone: true } }),
    ).toBe(true);
    expect(isStandaloneDisplay({ matchMedia: media('none'), navigator: {} })).toBe(false);
    expect(isStandaloneDisplay({})).toBe(false);
  });
});

describe('shouldShowInstallBanner', () => {
  const now = new Date('2026-09-23T00:00:00Z');
  const base = {
    standalone: false,
    installed: false,
    platform: 'chromium' as const,
    dismissedAt: null,
    now,
  };

  it('shows when installable and not dismissed', () => {
    expect(shouldShowInstallBanner(base)).toBe(true);
    expect(shouldShowInstallBanner({ ...base, platform: 'ios' })).toBe(true);
  });

  it('hides when already installed, standalone, or unsupported', () => {
    expect(shouldShowInstallBanner({ ...base, standalone: true })).toBe(false);
    expect(shouldShowInstallBanner({ ...base, installed: true })).toBe(false);
    expect(shouldShowInstallBanner({ ...base, platform: 'unsupported' })).toBe(false);
  });

  it('respects the dismissal window and ignores garbage timestamps', () => {
    const recent = new Date(now.getTime() - 3 * 86_400_000).toISOString();
    const old = new Date(now.getTime() - (INSTALL_DISMISS_DAYS + 1) * 86_400_000).toISOString();
    expect(shouldShowInstallBanner({ ...base, dismissedAt: recent })).toBe(false);
    expect(shouldShowInstallBanner({ ...base, dismissedAt: old })).toBe(true);
    expect(shouldShowInstallBanner({ ...base, dismissedAt: 'not-a-date' })).toBe(true);
  });
});
