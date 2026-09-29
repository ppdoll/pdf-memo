/** pdf.js가 암호 때문에 문서를 열지 못한 이유 */
export type PasswordErrorKind = 'needed' | 'incorrect';

/** pdf.js PasswordResponses 값. pdfjs-dist를 정적으로 끌어오지 않으려고 값만 둔다 */
const NEED_PASSWORD = 1;
const INCORRECT_PASSWORD = 2;

/** pdf.js의 PasswordException을 알아본다. 워커 경계를 넘어와도 name·code는 유지된다 */
export function passwordErrorKind(error: unknown): PasswordErrorKind | null {
  if (typeof error !== 'object' || error === null) return null;
  const { name, code } = error as { name?: unknown; code?: unknown };
  if (name !== 'PasswordException') return null;
  if (code === INCORRECT_PASSWORD) return 'incorrect';
  if (code === NEED_PASSWORD) return 'needed';
  return 'needed';
}

/** 암호 해제기(qpdf)가 암호가 틀렸다고 알릴 때 던진다 */
export class PdfPasswordError extends Error {
  constructor(message = '암호가 맞지 않습니다') {
    super(message);
    this.name = 'PdfPasswordError';
  }
}

export function isIncorrectPassword(error: unknown): boolean {
  if (error instanceof PdfPasswordError) return true;
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: unknown }).name === 'PdfPasswordError'
  );
}
