import { useEffect, useMemo, useState, type ClipboardEvent, type FormEvent } from 'react';
import { canReadClipboardText, clipboardFiles, readClipboardText } from './clipboard';
import {
  PASTE_MAX_CHARS,
  PASTED_KIND_LABEL,
  detectPastedKind,
  jsonProblem,
  pastedTextToFile,
  titleFromPastedText,
  type PastedKind,
} from './detect';

interface PasteImportDialogProps {
  /** 라이브러리에서 Ctrl+V로 열렸을 때 미리 채울 글 */
  initialText: string;
  /** 글로 만든 파일과 제목. 가져오기 큐에 넣는다 */
  onImport: (file: File, title: string) => void;
  /** 입력란에 스크린샷 등 파일을 붙여 넣었을 때 */
  onImportFiles: (files: File[]) => void;
  onClose: () => void;
}

type KindChoice = PastedKind | 'auto';

const KIND_CHOICES: KindChoice[] = ['auto', 'markdown', 'text', 'json'];

const chip = 'rounded-md px-2.5 py-1 text-xs transition';
const active = 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-400';
const idle = 'text-slate-700 hover:bg-slate-100';

/**
 * 파일 없이 글을 붙여 넣어 문서를 만드는 대화상자.
 * 종류는 자동 판별(JSON → 트리 문서, 마크다운·일반 글 → A4 PDF)하되 직접 고를 수 있다.
 * 글을 잃지 않도록 바깥을 눌러도 닫히지 않는다 (취소·Esc만).
 */
export function PasteImportDialog({
  initialText,
  onImport,
  onImportFiles,
  onClose,
}: PasteImportDialogProps) {
  const [text, setText] = useState(initialText);
  const [choice, setChoice] = useState<KindChoice>('auto');
  const [title, setTitle] = useState('');
  const [titleTouched, setTitleTouched] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detected = useMemo(() => detectPastedKind(text), [text]);
  const kind: PastedKind = choice === 'auto' ? detected : choice;
  const autoTitle = useMemo(() => titleFromPastedText(text, kind), [text, kind]);
  const effectiveTitle = titleTouched ? title : autoTitle;
  const empty = text.trim().length === 0;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function fillFromClipboard() {
    const read = await readClipboardText();
    if (read === null) {
      setHint('브라우저가 클립보드 읽기를 허용하지 않았습니다. 입력란에 직접 붙여 넣어 주세요.');
      return;
    }
    if (read.trim().length === 0) {
      setHint('클립보드에 글이 없습니다.');
      return;
    }
    setHint(null);
    setText(read);
  }

  function onPasteIntoBox(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = clipboardFiles(event.clipboardData);
    if (files.length === 0) return;
    // 스크린샷처럼 파일이 들어오면 글 대신 파일 가져오기로 보낸다
    event.preventDefault();
    onImportFiles(files);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (empty) return;
    if (text.length > PASTE_MAX_CHARS) {
      setError(`글이 너무 깁니다 (최대 ${PASTE_MAX_CHARS.toLocaleString()}자)`);
      return;
    }
    if (kind === 'json') {
      const problem = jsonProblem(text);
      if (problem) {
        setError(`JSON 문법이 맞지 않습니다: ${problem}`);
        return;
      }
    }
    const finalTitle = effectiveTitle.trim() || autoTitle;
    onImport(pastedTextToFile(text, kind, finalTitle), finalTitle);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="paste-import-title"
      data-paste-import-dialog
    >
      <form
        className="flex max-h-full w-full max-w-lg flex-col rounded-2xl bg-white p-5 shadow-xl"
        onSubmit={submit}
      >
        <h2 id="paste-import-title" className="text-base font-semibold text-slate-900">
          붙여넣기로 문서 만들기
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          복사한 글을 붙여 넣으면 문서가 됩니다. JSON은 접었다 펴는 문서로, 마크다운과 일반 글은 A4
          PDF로 만들어 필기할 수 있습니다. 스크린샷을 붙여 넣으면 이미지로 가져옵니다.
        </p>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onPaste={onPasteIntoBox}
          autoFocus
          rows={10}
          placeholder="여기에 붙여 넣으세요 (Ctrl+V, 휴대폰은 길게 눌러 붙여넣기)"
          className="mt-3 min-h-32 flex-1 resize-y rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm leading-snug focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
          data-paste-text
        />
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {canReadClipboardText() && (
            <button
              type="button"
              onClick={() => void fillFromClipboard()}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              data-paste-read-clipboard
            >
              클립보드에서 가져오기
            </button>
          )}
          <span>{text.length.toLocaleString()}자</span>
          {hint && <span className="text-amber-700">{hint}</span>}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1" aria-label="종류">
          <span className="mr-1 text-sm text-slate-700">종류</span>
          {KIND_CHOICES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setChoice(value);
                setError(null);
              }}
              className={`${chip} ${choice === value ? active : idle}`}
              aria-pressed={choice === value}
              data-paste-kind={value}
            >
              {value === 'auto'
                ? `자동 (${PASTED_KIND_LABEL[detected]})`
                : PASTED_KIND_LABEL[value]}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-sm text-slate-700" htmlFor="paste-import-title-input">
          제목
        </label>
        <input
          id="paste-import-title-input"
          type="text"
          value={effectiveTitle}
          onChange={(e) => {
            setTitle(e.target.value);
            setTitleTouched(true);
          }}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
          data-paste-title
        />
        <p className="mt-2 text-xs text-slate-500">
          {kind === 'json' ? 'JSON 문서(접기·펼치기)로 저장합니다.' : 'A4 PDF로 만들어 저장합니다.'}
        </p>
        {error && (
          <p className="mt-2 text-sm text-red-600" role="alert" data-paste-error>
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={empty}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
            data-paste-submit
          >
            문서 만들기
          </button>
        </div>
      </form>
    </div>
  );
}
