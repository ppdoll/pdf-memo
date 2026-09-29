import { documentKind, type AnnotationObject } from '@pdf-memo/shared';
import type { Storage } from '../../storage/ports';
import { decryptPdfFile } from '../import/encrypted/decryptPdf';
import { isIncorrectPassword } from '../import/encrypted/errors';
import { isPackAssetId } from '../sticker/pack';
import { loadTextFontBytes } from '../text/font';
import {
  EncryptedPdfError,
  flattenAnnotations,
  type FlattenAssets,
  type FlattenOptions,
} from './flatten';

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

  if (documentKind(doc) === 'json') {
    const jsonName = `${sanitizeFileName(doc.title)}.json`;
    return { file: new File([blob], jsonName, { type: 'application/json' }), drawn: 0, skipped: 0 };
  }

  const name = exportFileName(doc.title, kind);
  if (kind === 'original') {
    return { file: new File([blob], name, { type: 'application/pdf' }), drawn: 0, skipped: 0 };
  }

  const annotations = await storage.annotations.forDocument(documentId);
  const original = new Uint8Array(await blob.arrayBuffer());
  // 텍스트·노트가 있으면 화면과 같은 폰트를 임베드한다 (없으면 폰트를 내려받지 않는다)
  const needsFont = annotations.some((o) => o.type === 'text' || o.type === 'note');
  const fontBytes = options.fontBytes ?? (needsFont ? await loadTextFontBytes() : undefined);
  const assets = options.assets ?? (await loadImageAssets(storage, annotations));
  const flattenOptions: FlattenOptions = { ...options, fontBytes, assets };
  let result: Awaited<ReturnType<typeof flattenAnnotations>>;
  try {
    result = await flattenAnnotations(original, annotations, flattenOptions);
  } catch (error) {
    if (!(error instanceof EncryptedPdfError)) throw error;
    // 암호 해제가 생기기 전에 가져온, 소유자 암호만 걸린 PDF: 빈 암호로 풀어 다시 시도한다
    const unlocked = await unlockRestrictedPdf(blob);
    result = await flattenAnnotations(unlocked, annotations, flattenOptions);
  }
  const { bytes, drawn, skipped } = result;
  // pdf-lib가 돌려준 뷰를 새 ArrayBuffer로 복사해 BlobPart 타입에 맞춘다
  const part = new Uint8Array(bytes);
  return { file: new File([part], name, { type: 'application/pdf' }), drawn, skipped };
}

/** 사용자 암호 없이 열리는(권한 제한만 걸린) PDF의 암호화를 걷어낸다. 진짜 암호가 필요하면 EncryptedPdfError */
async function unlockRestrictedPdf(blob: Blob): Promise<Uint8Array> {
  try {
    const file = await decryptPdfFile(blob, '');
    return new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    if (isIncorrectPassword(error)) throw new EncryptedPdfError();
    throw error;
  }
}

/** 살아 있는 이미지 객체가 참조하는 사용자 자산(사진) 바이트를 모은다. 팩 스티커는 벡터라 제외 */
async function loadImageAssets(
  storage: Storage,
  annotations: readonly AnnotationObject[],
): Promise<FlattenAssets> {
  const ids = new Set<string>();
  for (const object of annotations) {
    if (object.type === 'image' && object.deletedAt === null && !isPackAssetId(object.assetId)) {
      ids.add(object.assetId);
    }
  }
  const assets = new Map<string, { mime: string; bytes: Uint8Array }>();
  for (const id of ids) {
    const asset = await storage.assets.get(id);
    if (asset) {
      assets.set(id, { mime: asset.mime, bytes: new Uint8Array(await asset.data.arrayBuffer()) });
    }
  }
  return assets;
}
