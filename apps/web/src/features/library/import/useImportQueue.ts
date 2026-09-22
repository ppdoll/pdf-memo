import { newId } from '@pdf-memo/shared';
import { useCallback, useRef, useState } from 'react';
import { storage } from '../../../storage';
import { analyzePdf } from '../../viewer/pdf/analyze';
import { importPdfFile, type ImportOutcome, type ImportStage } from './importPdf';

export interface ImportItem {
  id: string;
  fileName: string;
  stage: ImportStage | 'queued';
  outcome?: ImportOutcome;
}

interface ImportJob {
  item: ImportItem;
  file: File;
  folderId: string;
}

/**
 * 가져오기 큐. 파일을 한 번에 하나씩 처리해 메모리 사용을 제한하고,
 * 각 항목의 단계·결과를 UI에 노출한다.
 */
export function useImportQueue() {
  const [items, setItems] = useState<ImportItem[]>([]);
  const queueRef = useRef<ImportJob[]>([]);
  const runningRef = useRef(false);

  const patch = useCallback((id: string, changes: Partial<ImportItem>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)));
  }, []);

  const pump = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const job = queueRef.current.shift() as ImportJob;
        const outcome = await importPdfFile(job.file, {
          storage,
          analyze: analyzePdf,
          folderId: job.folderId,
          onStage: (stage) => patch(job.item.id, { stage }),
        });
        patch(job.item.id, { outcome });
      }
    } finally {
      runningRef.current = false;
    }
  }, [patch]);

  const importFiles = useCallback(
    (files: File[], folderId: string) => {
      if (files.length === 0) return;
      const jobs: ImportJob[] = files.map((file) => ({
        item: { id: newId(), fileName: file.name, stage: 'queued' },
        file,
        folderId,
      }));
      setItems((prev) => [...prev, ...jobs.map((j) => j.item)]);
      queueRef.current.push(...jobs);
      void pump();
    },
    [pump],
  );

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearFinished = useCallback(() => {
    setItems((prev) => prev.filter((item) => !item.outcome));
  }, []);

  return { items, importFiles, dismiss, clearFinished };
}
