/** 브라우저 다운로드. iOS Safari는 새 탭으로 열리므로 가능하면 공유 시트를 먼저 권한다 */
export function downloadFile(file: File): void {
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function')
    return false;
  try {
    const probe = new File(['%PDF-1.4'], 'probe.pdf', { type: 'application/pdf' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** 공유 시트. 사용자가 취소하면 false */
export async function shareFile(file: File, title: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    throw error;
  }
}
