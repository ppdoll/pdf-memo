/** 메인 스레드 ↔ qpdf 워커 메시지 */
export interface DecryptRequest {
  data: ArrayBuffer;
  password: string;
}

export type DecryptResponse =
  | { ok: true; data: ArrayBuffer }
  | { ok: false; code: 'incorrect' | 'load' | 'failed'; message: string };
