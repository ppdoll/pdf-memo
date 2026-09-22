import {
  ANNOTATION_SCHEMA_VERSION,
  AnnotationObjectSchema,
  AssetMetaSchema,
  BACKUP_FORMAT_VERSION,
  BackupManifestSchema,
  FolderSchema,
  MAX_FOLDER_DEPTH,
  PdfDocumentSchema,
  ROOT_FOLDER_ID,
  type AnnotationObject,
  type AssetMeta,
  type BackupManifest,
  type BaseEntity,
  type Folder,
  type PdfDocument,
} from '@pdf-memo/shared';
import { z } from 'zod';
import type { Storage } from '../../storage/ports';
import { parseEntryName } from './format';
import { asBlobPart, entryText, readZipEntries, type ZipEntry } from './zip';

export interface MergeCounts {
  added: number;
  updated: number;
  skipped: number;
  invalid: number;
}

export interface RestoreSummary {
  manifest: BackupManifest;
  folders: MergeCounts;
  documents: MergeCounts;
  annotations: MergeCounts;
  assets: { added: number; skipped: number; invalid: number };
  pdfs: { added: number; skipped: number; invalid: number };
  settings: { added: number; skipped: number };
  warnings: string[];
}

export interface RestoreProgress {
  phase: string;
  detail?: string;
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

const SettingEntrySchema = z.object({ key: z.string().min(1), value: z.unknown() });

const counts = (): MergeCounts => ({ added: 0, updated: 0, skipped: 0, invalid: 0 });

/** 같은 id가 있으면 updatedAt이 더 늦은 쪽을 택한다 (Last-Writer-Wins) */
export function mergeDecision<T extends BaseEntity>(
  existing: T | undefined,
  incoming: T,
): 'add' | 'update' | 'skip' {
  if (!existing) return 'add';
  return incoming.updatedAt > existing.updatedAt ? 'update' : 'skip';
}

/**
 * 백업 zip을 현재 저장소에 병합한다. 기존 데이터는 지우지 않는다.
 * 스트리밍으로 읽어 PDF·자산 바이너리는 즉시 저장하고, JSON은 모아 두었다가
 * PDF → 폴더(부모 먼저) → 문서 → 필기 → 설정 순서로 적용한다.
 */
export async function restoreBackup(
  storage: Storage,
  file: Blob,
  onProgress?: (progress: RestoreProgress) => void,
): Promise<RestoreSummary> {
  let manifest: BackupManifest | null = null;
  let folderRows: unknown[] = [];
  let documentRows: unknown[] = [];
  let settingRows: unknown[] = [];
  let assetMetaRows: unknown[] = [];
  const assetBytes = new Map<string, Uint8Array>();
  const annotationRows = new Map<string, unknown[]>();
  const summary: RestoreSummary = {
    manifest: {
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: '',
      annotationSchemaVersion: ANNOTATION_SCHEMA_VERSION,
      exportedAt: '',
      deviceId: '',
      counts: { folders: 0, documents: 0, annotations: 0, assets: 0, pdfs: 0 },
    },
    folders: counts(),
    documents: counts(),
    annotations: counts(),
    assets: { added: 0, skipped: 0, invalid: 0 },
    pdfs: { added: 0, skipped: 0, invalid: 0 },
    settings: { added: 0, skipped: 0 },
    warnings: [],
  };

  onProgress?.({ phase: '백업 파일 읽는 중' });
  const parseJson = (entry: ZipEntry): unknown => {
    try {
      return JSON.parse(entryText(entry));
    } catch {
      throw new BackupFormatError(`손상된 항목: ${entry.name}`);
    }
  };

  await readZipEntries(file, async (entry) => {
    const parsed = parseEntryName(entry.name);
    switch (parsed.kind) {
      case 'manifest': {
        const result = BackupManifestSchema.safeParse(parseJson(entry));
        if (!result.success) throw new BackupFormatError('백업 파일 형식을 인식할 수 없습니다');
        if (result.data.annotationSchemaVersion > ANNOTATION_SCHEMA_VERSION) {
          throw new BackupFormatError(
            '더 새로운 버전의 앱에서 만든 백업입니다. 앱을 업데이트한 뒤 복원하세요',
          );
        }
        manifest = result.data;
        return;
      }
      case 'settings':
        settingRows = asArray(parseJson(entry), entry.name);
        return;
      case 'folders':
        folderRows = asArray(parseJson(entry), entry.name);
        return;
      case 'documents':
        documentRows = asArray(parseJson(entry), entry.name);
        return;
      case 'assets':
        assetMetaRows = asArray(parseJson(entry), entry.name);
        return;
      case 'annotations':
        annotationRows.set(parsed.documentId, asArray(parseJson(entry), entry.name));
        return;
      case 'asset':
        assetBytes.set(parsed.assetId, entry.data);
        return;
      case 'pdf': {
        onProgress?.({ phase: 'PDF 원본', detail: parsed.hash.slice(0, 8) });
        if (await storage.blobs.has(parsed.hash)) {
          summary.pdfs.skipped += 1;
        } else {
          await storage.blobs.put(
            parsed.hash,
            new Blob([asBlobPart(entry.data)], { type: 'application/pdf' }),
          );
          summary.pdfs.added += 1;
        }
        return;
      }
      default:
        summary.warnings.push(`알 수 없는 항목 무시: ${entry.name}`);
    }
  });

  if (!manifest) throw new BackupFormatError('manifest.json이 없어 백업 파일이 아닙니다');
  summary.manifest = manifest;

  // 자산 (썸네일 등): 메타와 바이너리가 모두 있어야 넣는다
  onProgress?.({ phase: '자산' });
  for (const row of assetMetaRows) {
    const result = AssetMetaSchema.safeParse(row);
    if (!result.success) {
      summary.assets.invalid += 1;
      continue;
    }
    const meta: AssetMeta = result.data;
    const bytes = assetBytes.get(meta.id);
    if (!bytes) {
      summary.assets.invalid += 1;
      continue;
    }
    if (await storage.assets.get(meta.id)) {
      summary.assets.skipped += 1;
      continue;
    }
    await storage.assets.put({ ...meta, data: new Blob([asBlobPart(bytes)], { type: meta.mime }) });
    summary.assets.added += 1;
  }

  onProgress?.({ phase: '폴더' });
  await restoreFolders(storage, folderRows, summary);

  onProgress?.({ phase: '문서' });
  await restoreDocuments(storage, documentRows, summary);

  onProgress?.({ phase: '필기' });
  await restoreAnnotations(storage, annotationRows, summary);

  onProgress?.({ phase: '설정' });
  for (const row of settingRows) {
    const result = SettingEntrySchema.safeParse(row);
    if (!result.success || result.data.key.startsWith('backup.')) continue;
    if ((await storage.settings.get(result.data.key)) === undefined) {
      await storage.settings.set(result.data.key, result.data.value);
      summary.settings.added += 1;
    } else {
      summary.settings.skipped += 1;
    }
  }

  return summary;
}

function asArray(value: unknown, name: string): unknown[] {
  if (!Array.isArray(value)) throw new BackupFormatError(`손상된 항목: ${name}`);
  return value;
}

/** 부모가 먼저 들어가도록 반복적으로 처리하고, 끝까지 부모를 못 찾으면 루트로 옮긴다 */
async function restoreFolders(storage: Storage, rows: unknown[], summary: RestoreSummary) {
  const folders: Folder[] = [];
  for (const row of rows) {
    const result = FolderSchema.safeParse(row);
    if (result.success) folders.push(result.data);
    else summary.folders.invalid += 1;
  }

  let remaining = folders;
  const placed = new Set<string>();
  for (let round = 0; remaining.length > 0 && round <= MAX_FOLDER_DEPTH + 1; round += 1) {
    const next: Folder[] = [];
    for (const folder of remaining) {
      const parentReady =
        folder.parentId === ROOT_FOLDER_ID ||
        placed.has(folder.parentId) ||
        (await storage.folders.get(folder.parentId)) !== undefined;
      if (!parentReady) {
        next.push(folder);
        continue;
      }
      await applyFolder(storage, folder, summary);
      placed.add(folder.id);
    }
    if (next.length === remaining.length) break; // 진전 없음
    remaining = next;
  }
  for (const orphan of remaining) {
    summary.warnings.push(`상위 폴더를 찾지 못해 루트로 옮김: ${orphan.name}`);
    await applyFolder(storage, { ...orphan, parentId: ROOT_FOLDER_ID }, summary);
  }
}

async function applyFolder(storage: Storage, folder: Folder, summary: RestoreSummary) {
  const existing = await storage.folders.get(folder.id);
  const decision = mergeDecision(existing, folder);
  if (decision === 'skip') {
    summary.folders.skipped += 1;
    return;
  }
  try {
    await storage.folders.put(folder);
  } catch (error) {
    // 깊이 초과 등: 루트에 붙여서라도 살린다
    summary.warnings.push(
      `폴더 "${folder.name}"를 루트로 옮김 (${error instanceof Error ? error.message : String(error)})`,
    );
    await storage.folders.put({ ...folder, parentId: ROOT_FOLDER_ID });
  }
  summary.folders[decision === 'add' ? 'added' : 'updated'] += 1;
}

async function restoreDocuments(storage: Storage, rows: unknown[], summary: RestoreSummary) {
  for (const row of rows) {
    const result = PdfDocumentSchema.safeParse(row);
    if (!result.success) {
      summary.documents.invalid += 1;
      continue;
    }
    const doc: PdfDocument = result.data;
    const existing = await storage.documents.get(doc.id);
    const decision = mergeDecision(existing, doc);
    if (decision === 'skip') {
      summary.documents.skipped += 1;
      continue;
    }
    if (!(await storage.blobs.has(doc.blobHash))) {
      summary.documents.skipped += 1;
      summary.warnings.push(`PDF 원본이 없어 문서를 건너뜀: ${doc.title}`);
      continue;
    }
    if (
      !existing &&
      (await storage.folders.get(doc.folderId)) === undefined &&
      doc.folderId !== ROOT_FOLDER_ID
    ) {
      summary.warnings.push(`폴더를 찾지 못해 루트로 옮김: ${doc.title}`);
      doc.folderId = ROOT_FOLDER_ID;
    }
    await storage.documents.put(doc);
    summary.documents[decision === 'add' ? 'added' : 'updated'] += 1;
  }
}

async function restoreAnnotations(
  storage: Storage,
  rowsByDocument: Map<string, unknown[]>,
  summary: RestoreSummary,
) {
  for (const [documentId, rows] of rowsByDocument) {
    if ((await storage.documents.get(documentId)) === undefined) {
      summary.annotations.skipped += rows.length;
      summary.warnings.push(`문서가 없어 필기를 건너뜀: ${documentId.slice(0, 8)}…`);
      continue;
    }
    const toPut: AnnotationObject[] = [];
    for (const row of rows) {
      const result = AnnotationObjectSchema.safeParse(row);
      if (!result.success) {
        summary.annotations.invalid += 1;
        continue;
      }
      const object = result.data;
      if (object.documentId !== documentId) {
        summary.annotations.invalid += 1;
        continue;
      }
      const decision = mergeDecision(await storage.annotations.get(object.id), object);
      if (decision === 'skip') {
        summary.annotations.skipped += 1;
        continue;
      }
      toPut.push(object);
      summary.annotations[decision === 'add' ? 'added' : 'updated'] += 1;
    }
    if (toPut.length > 0) await storage.annotations.bulkPut(toPut);
  }
}
