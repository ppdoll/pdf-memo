import { useEffect, useState, type FormEvent } from 'react';
import { answerPdfPassword, usePdfPasswordPrompt } from './passwordPrompt';

/** 암호가 걸린 PDF를 가져올 때 암호를 묻는 대화상자. 가져오기 큐가 requestPdfPassword로 띄운다 */
export function PdfPasswordDialog() {
  const current = usePdfPasswordPrompt((s) => s.current);
  if (!current) return null;
  // 요청마다 새로 그려 입력란을 비우고 autoFocus를 다시 건다
  return <PasswordForm key={current.id} fileName={current.fileName} attempt={current.attempt} />;
}

function PasswordForm({ fileName, attempt }: { fileName: string; attempt: number }) {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const wrong = attempt > 1;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') answerPdfPassword(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (password.length === 0) return;
    answerPdfPassword(password);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-password-title"
      data-pdf-password-dialog
      onClick={() => answerPdfPassword(null)}
    >
      <form
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <h2 id="pdf-password-title" className="text-base font-semibold text-slate-900">
          암호가 걸린 PDF
        </h2>
        <p className="mt-1 truncate text-sm text-slate-500" title={fileName}>
          {fileName}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          암호를 입력하면 암호를 풀어서 저장합니다. 이 앱에서는 앞으로 암호 없이 열리고, 내보낸
          PDF에도 암호가 걸리지 않습니다.
        </p>
        <label
          className="mt-4 block text-sm font-medium text-slate-700"
          htmlFor="pdf-password-input"
        >
          암호
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id="pdf-password-input"
            type={visible ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            aria-invalid={wrong}
            aria-describedby={wrong ? 'pdf-password-error' : undefined}
            data-pdf-password-input
          />
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            className="rounded-lg border border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50"
            aria-pressed={visible}
          >
            {visible ? '숨기기' : '보기'}
          </button>
        </div>
        {wrong && (
          <p
            id="pdf-password-error"
            className="mt-2 text-sm text-red-600"
            role="alert"
            data-pdf-password-error
          >
            암호가 맞지 않습니다. 다시 입력해 주세요.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => answerPdfPassword(null)}
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={password.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            data-pdf-password-submit
          >
            열기
          </button>
        </div>
      </form>
    </div>
  );
}
