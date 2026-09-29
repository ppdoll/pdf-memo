import { MAX_PDF_BYTES, createPdfDocument, newId, nowIso, type PageSize } from '@pdf-memo/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { sha256Hex } from '../../../lib/hash';
import { formatBytes } from '../../../lib/quota';
import type { Storage } from '../../../storage/ports';
import { isIncorrectPassword, passwordErrorKind } from '../../import/encrypted/errors';

export interface PdfThumbnail {
  blob: Blob;
  width: number;
  height: number;
}

export interface PdfAnalysis {
  pageCount: number;
  pageSizes: PageSize[];
  thumbnail: PdfThumbnail | null;
  /**
   * 암호로 잠겨 있으면 true. 사용자 암호가 비어 있어(소유자 암호만 걸림) 열리긴 했지만
   * pdf-lib는 열 수 없으므로 저장 전에 풀어야 한다.
   */
  encrypted: boolean;
}

/** pdf.js로 페이지 수·크기·썸네일을 얻는다. 테스트에서는 가짜를 주입한다 */
export type PdfAnalyzer = (blob: Blob) => Promise<PdfAnalysis>;

export interface PasswordRequest {
  fileName: string;
  /** 1부터. 2 이상이면 직전에 넣은 암호가 틀린 것 */
  attempt: number;
}

/** 사용자에게 암호를 묻는다. 취소하면 null */
export type PasswordPrompt = (request: PasswordRequest) => Promise<string | null>;

/** 암호를 푼 새 PDF를 만든다. 빈 암호는 소유자 암호만 걸린 문서용. 틀리면 PdfPasswordError */
export type PdfDecryptor = (file: File, password: string) => Promise<File>;

export type ImportStage =
  'converting' | 'hashing' | 'analyzing' | 'password' | 'decrypting' | 'saving';

export type ImportOutcome =
  | { status: 'done'; documentId: string; decrypted?: boolean }
  | { status: 'duplicate'; existingDocumentId: string; existingTitle: string }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export interface ImportOptions {
  storage: Storage;
  analyze: PdfAnalyzer;
  folderId: string;
  onStage?: (stage: ImportStage) => void;
  /** 테스트용 상한 재정의 */
  maxBytes?: number;
  /** 변환해서 들어온 파일(마크다운 등)의 제목과 원래 파일 이름 */
  title?: string;
  originalFileName?: string;
  /** 암호가 걸린 PDF를 만났을 때 암호를 묻는다. 없으면 그런 파일은 오류로 끝난다 */
  requestPassword?: PasswordPrompt;
  /** 암호를 푼다. 없으면 잠긴 파일은 오류로 끝나고, 소유자 암호만 걸린 파일은 그대로 저장한다 */
  decrypt?: PdfDecryptor;
}

export const ENCRYPTED_PDF_MESSAGE = '암호가 걸린 PDF입니다. 암호를 입력해야 가져올 수 있습니다';

export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}

export function titleFromFileName(name: string): string {
  const title = name
    .trim()
    .replace(/\.pdf$/i, '')
    .trim();
  return title.length > 0 ? title.slice(0, 300) : '제목 없음';
}

/**
 * PDF 한 개를 라이브러리에 넣는다.
 * 해시 → 중복 검사 → pdf.js 분석 → (Blob + 썸네일 + 문서)를 한 트랜잭션으로 저장.
 * 암호가 걸린 파일은 분석 단계에서 드러나므로 암호를 물어 푼 뒤 해시부터 다시 한다.
 * pdf.js 분석은 IndexedDB 트랜잭션 밖에서 끝내야 한다(Dexie는 외부 await를 허용하지 않음).
 */
export async function importPdfFile(file: File, options: ImportOptions): Promise<ImportOutcome> {
  const {
    storage,
    analyze,
    folderId,
    onStage,
    maxBytes = MAX_PDF_BYTES,
    title,
    originalFileName,
    requestPassword,
    decrypt,
  } = options;

  if (!isPdfFile(file)) return { status: 'error', message: 'PDF 파일이 아닙니다' };
  if (file.size === 0) return { status: 'error', message: '빈 파일입니다' };
  if (file.size > maxBytes) {
    return { status: 'error', message: `파일이 너무 큽니다 (최대 ${formatBytes(maxBytes)})` };
  }

  onStage?.('hashing');
  let source = file;
  let hash = await sha256Hex(source);
  const existing = await findDuplicate(storage, hash);
  if (existing) return existing;

  onStage?.('analyzing');
  let analysis: PdfAnalysis | undefined;
  let decrypted = false;
  let attempt = 0;
  while (!analysis) {
    let password: string;
    try {
      const result = await analyze(source);
      // 한 번 풀었으면 결과를 그대로 받아들인다 (다시 풀려고 돌지 않는다)
      if (!result.encrypted || !decrypt || decrypted) {
        analysis = result;
        break;
      }
      // 소유자 암호만 걸린 문서: 열리긴 하지만 내보내기가 막히므로 빈 암호로 푼다
      password = '';
    } catch (error) {
      if (!passwordErrorKind(error)) {
        const reason = error instanceof Error ? error.message : String(error);
        return { status: 'error', message: `PDF를 읽을 수 없습니다: ${reason}` };
      }
      if (!requestPassword || !decrypt || decrypted) {
        return { status: 'error', message: ENCRYPTED_PDF_MESSAGE };
      }
      attempt += 1;
      onStage?.('password');
      const answer = await requestPassword({ fileName: file.name, attempt });
      if (answer === null) return { status: 'cancelled' };
      password = answer;
    }

    onStage?.('decrypting');
    try {
      source = await decrypt(source, password);
    } catch (error) {
      if (password.length > 0 && isIncorrectPassword(error)) {
        // 틀린 암호: 분석으로 돌아가면 다시 암호를 묻게 된다
        onStage?.('analyzing');
        continue;
      }
      const reason = error instanceof Error ? error.message : String(error);
      return { status: 'error', message: `암호를 풀지 못했습니다: ${reason}` };
    }
    decrypted = true;

    onStage?.('hashing');
    hash = await sha256Hex(source);
    const unlockedTwin = await findDuplicate(storage, hash);
    if (unlockedTwin) return unlockedTwin;
    onStage?.('analyzing');
  }

  if (analysis.pageCount < 1 || analysis.pageSizes.length !== analysis.pageCount) {
    return { status: 'error', message: '페이지 정보를 읽을 수 없습니다' };
  }

  onStage?.('saving');
  const siblings = await storage.documents.inFolder(folderId);
  const sortKey = generateKeyBetween(siblings.at(-1)?.sortKey ?? null, null);
  const thumbnail = analysis.thumbnail;
  const thumbnailAsset = thumbnail
    ? {
        id: newId(),
        kind: 'thumbnail' as const,
        mime: thumbnail.blob.type || 'image/jpeg',
        width: thumbnail.width,
        height: thumbnail.height,
        byteSize: thumbnail.blob.size,
        createdAt: nowIso(),
        ownerId: null,
        data: thumbnail.blob,
      }
    : null;

  const draft = createPdfDocument({
    title: title?.trim() ? title.trim().slice(0, 300) : titleFromFileName(file.name),
    originalFileName: (originalFileName ?? file.name).slice(0, 300),
    blobHash: hash,
    byteSize: source.size,
    pageCount: analysis.pageCount,
    pageSizes: analysis.pageSizes,
    sortKey,
    folderId,
  });
  draft.thumbnailAssetId = thumbnailAsset?.id ?? null;

  const saved = await storage.transaction(async () => {
    await storage.blobs.put(hash, source.slice(0, source.size, 'application/pdf'));
    if (thumbnailAsset) await storage.assets.put(thumbnailAsset);
    return storage.documents.put(draft);
  });

  return { status: 'done', documentId: saved.id, decrypted };
}

async function findDuplicate(storage: Storage, hash: string): Promise<ImportOutcome | null> {
  const existing = await storage.documents.byBlobHash(hash);
  if (existing.length === 0) return null;
  return {
    status: 'duplicate',
    existingDocumentId: existing[0].id,
    existingTitle: existing[0].title,
  };
}
