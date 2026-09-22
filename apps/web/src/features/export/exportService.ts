import type { Storage } from '../../storage/ports';
import { flattenAnnotations, type FlattenOptions } from './flatten';

export type ExportKind = 'original' | 'flattened';

export interface ExportOutput {
  file: File;
  drawn: number;
  skipped: number;
}

/** 파일 시스템에서 금지된 문자를 빼고 길이를 제한한다 */
export function sanitizeFileName(name: string, fallback = '문서'): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
    .replace(/[. ]+$/g, '');
  return cleaned.length > 0 ? cleaned : fallback;
}

export function exportFileName(title: string, kind: ExportKind): string {
  const base = sanitizeFileName(title);
  return kind === 'flattened' ? `${base} (필기).pdf` : `${base}.pdf`;
}

/**
 * 문서를 PDF 파일로 만든다. 'original'은 저장된 바이트 그대로, 'flattened'는 주석을 벡터로 구워 넣는다.
 * 호출 전에 세션의 쓰기 큐를 flush해야 마지막 스트로크까지 포함된다.
 */
export async function exportDocument(
  storage: Storage,
  documentId: string,
  kind: ExportKind,
  options: FlattenOptions = {},
): Promise<ExportOutput> {
  const doc = await storage.documents.get(documentId);
  if (!doc) throw new Error('문서를 찾을 수 없습니다');
  const blob = await storage.blobs.get(doc.blobHash);
  if (!blob) throw new Error('PDF 원본을 찾을 수 없습니다');

  const name = exportFileName(doc.title, kind);
  if (kind === 'original') {
    return { file: new File([blob], name, { type: 'application/pdf' }), drawn: 0, skipped: 0 };
  }

  const annotations = await storage.annotations.forDocument(documentId);
  const original = new Uint8Array(await blob.arrayBuffer());
  const { bytes, drawn, skipped } = await flattenAnnotations(original, annotations, options);
  // pdf-lib가 돌려준 뷰를 새 ArrayBuffer로 복사해 BlobPart 타입에 맞춘다
  const part = new Uint8Array(bytes);
  return { file: new File([part], name, { type: 'application/pdf' }), drawn, skipped };
}
