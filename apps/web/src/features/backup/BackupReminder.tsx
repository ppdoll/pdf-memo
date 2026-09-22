import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { storage } from '../../storage';
import { BACKUP_REMINDER_DAYS, SETTINGS_LAST_BACKUP, SETTINGS_REMIND_AFTER } from './format';

const DAY_MS = 86_400_000;

/**
 * 문서가 있는데 백업이 없거나 오래됐으면 라이브러리 상단에 조용히 알린다.
 * "나중에"를 누르면 일정 기간 다시 묻지 않는다.
 */
export function BackupReminder({ documentCount }: { documentCount: number }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (documentCount === 0) {
      setMessage(null);
      return;
    }
    (async () => {
      const [lastAt, remindAfter] = await Promise.all([
        storage.settings.get<string>(SETTINGS_LAST_BACKUP),
        storage.settings.get<string>(SETTINGS_REMIND_AFTER),
      ]);
      if (cancelled) return;
      const now = Date.now();
      if (remindAfter && new Date(remindAfter).getTime() > now) {
        setMessage(null);
        return;
      }
      if (!lastAt) {
        setMessage('아직 백업이 없습니다. 브라우저 저장소가 지워지면 필기를 되돌릴 수 없습니다.');
        return;
      }
      const days = Math.floor((now - new Date(lastAt).getTime()) / DAY_MS);
      setMessage(days >= BACKUP_REMINDER_DAYS ? `마지막 백업이 ${days}일 전입니다.` : null);
    })().catch((error: unknown) => console.error('[BackupReminder]', error));
    return () => {
      cancelled = true;
    };
  }, [documentCount]);

  if (!message) return null;

  async function snooze() {
    setMessage(null);
    await storage.settings.set(
      SETTINGS_REMIND_AFTER,
      new Date(Date.now() + BACKUP_REMINDER_DAYS * DAY_MS).toISOString(),
    );
  }

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
      role="status"
    >
      <span>{message}</span>
      <span className="flex gap-2">
        <Link
          to="/settings#backup"
          className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700"
        >
          지금 백업
        </Link>
        <button
          type="button"
          onClick={() => void snooze()}
          className="rounded-md px-2.5 py-1 text-xs text-amber-800 hover:bg-amber-100"
        >
          {BACKUP_REMINDER_DAYS}일 뒤에 다시 알림
        </button>
      </span>
    </div>
  );
}
