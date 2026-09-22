import { useEffect } from 'react';

interface ImageImportChoiceProps {
  count: number;
  /** merge = 한 문서(여러 페이지)로, 아니면 한 장씩 문서로 */
  onChoose: (merge: boolean) => void;
  onCancel: () => void;
}

/** 이미지를 여러 장 한 번에 넣었을 때 묻는 작은 대화상자 */
export function ImageImportChoice({ count, onChoose, onCancel }: ImageImportChoiceProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-import-title"
      data-image-import-choice
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="image-import-title" className="text-base font-semibold text-slate-900">
          이미지 {count}장을 어떻게 가져올까요?
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          사진마다 따로 메모하려면 각각, 스캔한 여러 장짜리 문서라면 한 문서로 묶는 게 편합니다.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onChoose(false)}
            className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            data-choice="separate"
            autoFocus
          >
            각각 문서로 ({count}개)
          </button>
          <button
            type="button"
            onClick={() => onChoose(true)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
            data-choice="merge"
          >
            한 문서로 묶기 ({count}쪽)
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
          >
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
