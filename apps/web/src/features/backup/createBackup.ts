import {
  ANNOTATION_SCHEMA_VERSION,
  BACKUP_FORMAT_VERSION,
  nowIso,
  type AnnotationObject,
  type BackupManifest,
} from '@pdf-memo/shared';
import { getDeviceId } from '../../lib/deviceId';
import type { Storage } from '../../storage/ports';
import {
  ENTRY,
  SETTINGS_LAST_BACKUP,
  annotationsEntry,
  assetEntry,
  backupFileName,
  pdfEntry,
} from './format';
import { ZipWriter } from './zip';

export interface BackupProgress {
  phase: string;
  done: number;
  total: number;
}

export interface BackupResult {
  file: File;
  manifest: BackupManifest;
  warnings: string[];
}

/**
 * 저장소 전체를 백업 zip으로 만든다. 휴지통에 있는 항목과 tombstone도 포함해 완전한 스냅샷을 만든다.
 * 성공하면 settings의 마지막 백업 시각을 갱신한다.
 */
export async function createBackup(
  storage: Storage,
  appVersion: string,
  onProgress?: (progress: BackupProgress) => void,
): Promise<BackupResult> {
  const warnings: string[] = [];
  onProgress?.({ phase: '목록 읽는 중', done: 0, total: 1 });

  const [folders, documents, assets, settings, deviceId] = await Promise.all([
    storage.folders.all(),
    storage.documents.all(),
    storage.assets.all(),
    storage.settings.all(),
    getDeviceId(storage),
  ]);

  const annotationsByDocument = new Map<string, AnnotationObject[]>();
  let annotationCount = 0;
  for (const doc of documents) {
    const objects = await storage.annotations.allForDocument(doc.id);
    if (objects.length > 0) {
      annotationsByDocument.set(doc.id, objects);
      annotationCount += objects.length;
    }
  }
  const hashes = [...new Set(documents.map((d) => d.blobHash))];

  const manifest: BackupManifest = {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion,
    annotationSchemaVersion: ANNOTATION_SCHEMA_VERSION,
    exportedAt: nowIso(),
    deviceId,
    counts: {
      folders: folders.length,
      documents: documents.length,
      annotations: annotationCount,
      assets: assets.length,
      pdfs: hashes.length,
    },
  };

  const writer = new ZipWriter();
  writer.addJson(ENTRY.manifest, manifest);
  writer.addJson(
    ENTRY.settings,
    settings.filter((entry) => !entry.key.startsWith('backup.')),
  );
  writer.addJson(ENTRY.folders, folders);
  writer.addJson(ENTRY.documents, documents);
  writer.addJson(
    ENTRY.assets,
    assets.map(({ data: _data, ...meta }) => meta),
  );

  let done = 0;
  const total = assets.length + hashes.length + annotationsByDocument.size;
  for (const asset of assets) {
    writer.addBytes(assetEntry(asset.id), new Uint8Array(await asset.data.arrayBuffer()));
    done += 1;
    onProgress?.({ phase: '자산', done, total });
  }
  for (const hash of hashes) {
    const blob = await storage.blobs.get(hash);
    if (!blob) {
      warnings.push(`PDF 원본이 없어 건너뜀: ${hash.slice(0, 8)}…`);
    } else {
      writer.addBytes(pdfEntry(hash), new Uint8Array(await blob.arrayBuffer()));
    }
    done += 1;
    onProgress?.({ phase: 'PDF 원본', done, total });
  }
  for (const [documentId, objects] of annotationsByDocument) {
    writer.addJson(annotationsEntry(documentId), objects);
    done += 1;
    onProgress?.({ phase: '필기', done, total });
  }

  onProgress?.({ phase: '압축 마무리', done: total, total });
  const blob = await writer.finish();
  const file = new File([blob], backupFileName(new Date(manifest.exportedAt)), {
    type: 'application/zip',
  });
  await storage.settings.set(SETTINGS_LAST_BACKUP, manifest.exportedAt);
  return { file, manifest, warnings };
}
