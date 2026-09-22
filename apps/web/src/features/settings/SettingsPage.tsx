import { requestPersistentStorage } from '../../lib/quota';
import { ApiStatus } from '../status/ApiStatus';
import { StorageStatus } from '../status/StorageStatus';

export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h1 className="text-xl font-semibold">설정</h1>
        <p className="mt-1 text-sm text-slate-500">PDF MEMO v{__APP_VERSION__}</p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm">
        <h2 className="font-semibold">데이터 보호</h2>
        <p className="mt-2 text-slate-600">
          모든 데이터는 이 브라우저 안(IndexedDB)에만 저장됩니다. 브라우저가 저장 공간을 정리하면
          삭제될 수 있으니 홈 화면에 앱을 추가하고 주기적으로 백업하세요.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-600">
          <li>iPad·iPhone: 공유 → "홈 화면에 추가" (7일 미사용 삭제 규칙에서 제외됩니다)</li>
          <li>Chrome·Edge: 주소창의 설치 아이콘으로 앱 설치</li>
        </ul>
        <button
          type="button"
          onClick={() => void requestPersistentStorage()}
          className="mt-4 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
        >
          영구 저장 요청
        </button>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <StorageStatus />
        <ApiStatus />
      </div>

      <section className="rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
        백업 내보내기·복원, 펜 기본값, 스티커 관리는 다음 단계에서 추가됩니다.
      </section>
    </div>
  );
}
