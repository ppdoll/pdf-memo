import { createStorage } from './dexie/DexieStorage';
import type { Storage } from './ports';

export type * from './ports';

/** 앱 전역 저장소 인스턴스. UI와 서비스는 Storage 인터페이스로만 접근한다 */
export const storage: Storage = createStorage();
