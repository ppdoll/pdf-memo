import { MAX_PDF_BYTES, createPdfDocument, newId, nowIso, type PageSize } from '@pdf-memo/shared';
import { generateKeyBetween } from 'fractional-indexing';
import { sha256Hex } from '../../../lib/hash';
import { formatBytes } from '../../../lib/quota';
import type { Storage } from '../../../storage/ports';

export interface PdfThumbnail {
  blob: Blob;
  width: number;
  height: number;
}

export interface PdfAnalysis {
  pageCount: number;
  pageSizes: PageSize[];
  thumbnail: PdfThumbnail | null;
}

/** pdf.js로 페이지 수·크기·썸네일을 얻는다. 테스트에서는 가짜를 주입한다 */
export type PdfAnalyzer = (blob: Blob) => Promise<PdfAnalysis>;

export type ImportStage = 'hashing' | 'analyzing' | 'saving';

export type ImportOutcome =
  | { status: 'done'; documentId: string }
  | { status: 'duplicate'; existingDocumentId: string; existingTitle: string }
  | { status: 'error'; message: string };

export interface ImportOptions {
  storage: Storage;
  analyze: PdfAnalyzer;
  folderId: string;
  onStage?: (stage: ImportStage) => void;
  /** 테스트용 상한 재정의 */
  maxBytes?: number;
}

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
 * pdf.js 분석은 IndexedDB 트랜잭션 밖에서 끝내야 한다(Dexie는 외부 await를 허용하지 않음).
 */
export async function importPdfFile(file: File, options: ImportOptions): Promise<ImportOutcome> {
  const { storage, analyze, folderId, onStage, maxBytes = MAX_PDF_BYTES } = options;

  if (!isPdfFile(file)) return { status: 'error', message: 'PDF 파일이 아닙니다' };
  if (file.size === 0) return { status: 'error', message: '빈 파일입니다' };
  if (file.size > maxBytes) {
    return { status: 'error', message: `파일이 너무 큽니다 (최대 ${formatBytes(maxBytes)})` };
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

  onStage?.('analyzing');
  let analysis: PdfAnalysis;
  try {
    analysis = await analyze(file);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { status: 'error', message: `PDF를 읽을 수 없습니다: ${reason}` };
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
    title: titleFromFileName(file.name),
    originalFileName: file.name.slice(0, 300),
    blobHash: hash,
    byteSize: file.size,
    pageCount: analysis.pageCount,
    pageSizes: analysis.pageSizes,
    sortKey,
    folderId,
  });
  draft.thumbnailAssetId = thumbnailAsset?.id ?? null;

  const saved = await storage.transaction(async () => {
    await storage.blobs.put(hash, file.slice(0, file.size, 'application/pdf'));
    if (thumbnailAsset) await storage.assets.put(thumbnailAsset);
    return storage.documents.put(draft);
  });

  return { status: 'done', documentId: saved.id };
}
