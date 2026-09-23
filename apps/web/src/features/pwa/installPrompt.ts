import { create } from 'zustand';
import { requestPersistentStorage } from '../../lib/quota';

/** Chromium 계열이 주는 설치 이벤트 (표준 타입 정의가 없어 여기서 선언) */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface InstallState {
  /** 브라우저가 건네준 설치 이벤트. 우리가 원하는 때에 prompt()를 부른다 */
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
  setDeferred(event: BeforeInstallPromptEvent | null): void;
  setInstalled(value: boolean): void;
}

export const useInstallStore = create<InstallState>()((set) => ({
  deferred: null,
  installed: false,
  setDeferred: (deferred) => set({ deferred }),
  setInstalled: (installed) => set({ installed }),
}));

let armed = false;

/**
 * 앱 시작 시 한 번 부른다. 브라우저의 기본 설치 미니 배너를 막고 이벤트를 보관해
 * 라이브러리 화면의 배너에서 우리가 정한 시점에 설치를 띄운다.
 */
export function setupInstallPrompt(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    useInstallStore.getState().setDeferred(event as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => {
    useInstallStore.getState().setInstalled(true);
    useInstallStore.getState().setDeferred(null);
    // 설치한 앱의 데이터가 브라우저 정리로 사라지지 않게 보호를 요청한다
    void requestPersistentStorage();
  });
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** 설치 대화상자를 띄운다. 사용자 제스처 안에서 불러야 한다 */
export async function promptInstall(): Promise<InstallOutcome> {
  const { deferred, setDeferred, setInstalled } = useInstallStore.getState();
  if (!deferred) return 'unavailable';
  try {
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
      void requestPersistentStorage();
    }
    return choice.outcome;
  } catch (error) {
    console.warn('[pwa] install prompt failed', error);
    return 'unavailable';
  } finally {
    // 이벤트는 한 번만 쓸 수 있다
    setDeferred(null);
  }
}
