import { BACKUP_FILE_EXTENSION } from '@pdf-memo/shared';

/**
 * 백업 zip 구조 (docs/DESIGN.md §7.4)
 *   manifest.json                  버전·시각·기기·개수
 *   settings.json                  SettingEntry[] (backup.* 키는 복원 시 무시)
 *   folders.json                   Folder[] (휴지통 포함)
 *   documents.json                 PdfDocument[] (휴지통 포함)
 *   assets.json                    AssetMeta[]
 *   assets/<encodeURIComponent(id)> 자산 바이너리
 *   pdfs/<sha256>.pdf              PDF 원본 (중복 제거)
 *   annotations/<documentId>.json  AnnotationObject[] (tombstone 포함)
 */
export const ENTRY = {
  manifest: 'manifest.json',
  settings: 'settings.json',
  folders: 'folders.json',
  documents: 'documents.json',
  assets: 'assets.json',
  annotationsDir: 'annotations/',
  assetsDir: 'assets/',
  pdfsDir: 'pdfs/',
} as const;

export const annotationsEntry = (documentId: string): string =>
  `${ENTRY.annotationsDir}${documentId}.json`;
export const assetEntry = (assetId: string): string =>
  `${ENTRY.assetsDir}${encodeURIComponent(assetId)}`;
export const pdfEntry = (hash: string): string => `${ENTRY.pdfsDir}${hash}.pdf`;

export type ParsedEntry =
  | { kind: 'manifest' | 'settings' | 'folders' | 'documents' | 'assets' }
  | { kind: 'annotations'; documentId: string }
  | { kind: 'asset'; assetId: string }
  | { kind: 'pdf'; hash: string }
  | { kind: 'unknown' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;

export function parseEntryName(name: string): ParsedEntry {
  switch (name) {
    case ENTRY.manifest:
      return { kind: 'manifest' };
    case ENTRY.settings:
      return { kind: 'settings' };
    case ENTRY.folders:
      return { kind: 'folders' };
    case ENTRY.documents:
      return { kind: 'documents' };
    case ENTRY.assets:
      return { kind: 'assets' };
    default:
  }
  if (name.startsWith(ENTRY.annotationsDir) && name.endsWith('.json')) {
    const documentId = name.slice(ENTRY.annotationsDir.length, -'.json'.length);
    if (UUID.test(documentId)) return { kind: 'annotations', documentId };
  }
  if (name.startsWith(ENTRY.pdfsDir) && name.endsWith('.pdf')) {
    const hash = name.slice(ENTRY.pdfsDir.length, -'.pdf'.length);
    if (SHA256.test(hash)) return { kind: 'pdf', hash };
  }
  if (name.startsWith(ENTRY.assetsDir) && name.length > ENTRY.assetsDir.length) {
    try {
      return { kind: 'asset', assetId: decodeURIComponent(name.slice(ENTRY.assetsDir.length)) };
    } catch {
      return { kind: 'unknown' };
    }
  }
  return { kind: 'unknown' };
}

/** `PDF MEMO 백업 2026-09-22 1530.pdfmemo.zip` */
export function backupFileName(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}${pad(date.getMinutes())}`;
  return `PDF MEMO 백업 ${stamp}${BACKUP_FILE_EXTENSION}`;
}

/** settings 키 */
export const SETTINGS_LAST_BACKUP = 'backup.lastAt';
export const SETTINGS_REMIND_AFTER = 'backup.remindAfter';
export const BACKUP_REMINDER_DAYS = 7;
