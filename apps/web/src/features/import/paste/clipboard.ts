/** 입력란·편집 영역 안에서의 붙여넣기는 가로채지 않는다 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  return target.isContentEditable;
}

/** 클립보드 이벤트에 담긴 파일(스크린샷, 복사한 파일) */
export function clipboardFiles(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files);
}

export function canReadClipboardText(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.clipboard?.readText === 'function';
}

/**
 * 버튼으로 클립보드 글을 읽는다. 사용자 제스처 안에서 불러야 하고,
 * 브라우저가 막으면 null을 돌려준다(그때는 입력란에 직접 붙여 넣게 안내한다).
 */
export async function readClipboardText(): Promise<string | null> {
  if (!canReadClipboardText()) return null;
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
