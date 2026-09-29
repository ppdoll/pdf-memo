import createModule from '@neslinesli93/qpdf-wasm';
import wasmUrl from '@neslinesli93/qpdf-wasm/dist/qpdf.wasm?url';
import { isIncorrectPassword } from './errors';
import type { DecryptRequest, DecryptResponse } from './protocol';
import { createQpdfRunner, decryptWithQpdf, type QpdfFactory } from './qpdfDecrypt';

/**
 * 암호 해제 워커. 요청마다 새로 띄우고 끝나면 메인 스레드가 terminate하므로
 * 모듈(약 1.3MB wasm)은 한 번만 만들고 파일도 한 번만 처리한다.
 */
interface WorkerScope {
  onmessage: ((event: MessageEvent<DecryptRequest>) => void) | null;
  postMessage(message: DecryptResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

scope.onmessage = async (event) => {
  const { data, password } = event.data;
  let qpdf;
  try {
    qpdf = await createQpdfRunner(createModule as unknown as QpdfFactory, () => wasmUrl);
  } catch (error) {
    scope.postMessage({ ok: false, code: 'load', message: errorMessage(error) });
    return;
  }
  try {
    // 복사해서 넘긴다: 가상 파일 시스템의 버퍼는 transfer할 수 없다
    const out = decryptWithQpdf(qpdf, new Uint8Array(data), password).slice();
    scope.postMessage({ ok: true, data: out.buffer }, [out.buffer]);
  } catch (error) {
    scope.postMessage({
      ok: false,
      code: isIncorrectPassword(error) ? 'incorrect' : 'failed',
      message: errorMessage(error),
    });
  }
};
