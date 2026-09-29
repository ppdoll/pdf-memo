import { PdfPasswordError } from './errors';
import type { DecryptRequest, DecryptResponse } from './protocol';

export const DECRYPT_UNAVAILABLE_MESSAGE =
  '암호 해제 모듈을 불러오지 못했습니다. 인터넷에 연결한 뒤 다시 시도해 주세요';

/**
 * 암호 걸린 PDF를 워커의 qpdf(WebAssembly, 처음 쓸 때 약 1.3MB를 내려받음)로 풀어 새 파일로 돌려준다.
 * 빈 암호는 소유자 암호만 걸린(인쇄·복사 제한) 문서를 푼다. 암호가 틀리면 PdfPasswordError.
 */
export async function decryptPdfFile(
  source: Blob,
  password: string,
  fileName?: string,
): Promise<File> {
  const data = await source.arrayBuffer();
  const worker = new Worker(new URL('./qpdf.worker.ts', import.meta.url), { type: 'module' });
  try {
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<DecryptResponse>) => {
        const response = event.data;
        if (response.ok) resolve(response.data);
        else if (response.code === 'incorrect') reject(new PdfPasswordError());
        else if (response.code === 'load')
          reject(new Error(`${DECRYPT_UNAVAILABLE_MESSAGE} (${response.message})`));
        else reject(new Error(response.message));
      };
      worker.onerror = (event) => {
        event.preventDefault();
        const detail = event.message ? ` (${event.message})` : '';
        reject(new Error(`${DECRYPT_UNAVAILABLE_MESSAGE}${detail}`));
      };
      const request: DecryptRequest = { data, password };
      worker.postMessage(request, [data]);
    });
    const name = fileName ?? (source instanceof File ? source.name : 'document.pdf');
    return new File([bytes], name, { type: 'application/pdf' });
  } finally {
    worker.terminate();
  }
}
