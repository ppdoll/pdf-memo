import { createPdfDocument } from '@pdf-memo/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { sha256Hex } from '../../../lib/hash';
import { formatBytes } from '../../../lib/quota';
import type { Storage } from '../../../storage/ports';
import { MAX_JSON_BYTES, isJsonFile, titleFromJsonFileName } from '../../import/json/detect';
import { describeJsonError } from '../../json/model';
import type { ImportOutcome, ImportStage } from './importPdf';

export interface ImportJsonOptions {
  storage: Storage;
  folderId: string;
  onStage?: (stage: ImportStage) => void;
  maxBytes?: number;
}

/** JSON 문서의 자리 페이지 크기 (A4). 뷰어는 쓰지 않지만 스키마가 요구한다 */
export const JSON_PAGE_SIZE = { w: 595.28, h: 841.89, rotation: 0 as const };

/**
 * JSON 파일을 라이브러리에 넣는다. 문법을 검사하고, 바이트는 PDF와 같은 내용 해시 저장소에 두며,
 * 문서는 kind 'json'으로 저장해 트리 뷰어로 연다. 해시가 같은 파일은 중복으로 알린다.
 */
export async function importJsonFile(
  file: File,
  options: ImportJsonOptions,
): Promise<ImportOutcome> {
  const { storage, folderId, onStage, maxBytes = MAX_JSON_BYTES } = options;
  if (!isJsonFile(file)) return { status: 'error', message: 'JSON 파일이 아닙니다' };
  if (file.size === 0) return { status: 'error', message: '빈 파일입니다' };
  if (file.size > maxBytes) {
    return { status: 'error', message: `파일이 너무 큽니다 (최대 ${formatBytes(maxBytes)})` };
  }

  onStage?.('analyzing');
  const text = await file.text();
  try {
    JSON.parse(text);
  } catch (error) {
    return { status: 'error', message: describeJsonError(error, text) };
  }

  onStage?.('hashing');
  const hash = await sha256Hex(file);
  const existing = await storage.documents.byBlobHash(hash);
  if (existing.length > 0) {
    return {
      status: 'duplicate',
      existingDocumentId: existing[0].id,
      existingTitle: existing[0].title,
    };
  }

  onStage?.('saving');
  const siblings = await storage.documents.inFolder(folderId);
  const sortKey = generateKeyBetween(siblings.at(-1)?.sortKey ?? null, null);
  const draft = createPdfDocument({
    title: titleFromJsonFileName(file.name),
    originalFileName: file.name.slice(0, 300),
    blobHash: hash,
    byteSize: file.size,
    pageCount: 1,
    pageSizes: [JSON_PAGE_SIZE],
    sortKey,
    folderId,
    kind: 'json',
  });
  const saved = await storage.transaction(async () => {
    await storage.blobs.put(hash, file.slice(0, file.size, 'application/json'));
    return storage.documents.put(draft);
  });
  return { status: 'done', documentId: saved.id };
}
