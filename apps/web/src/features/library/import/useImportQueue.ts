import { newId } from '@pdf-memo/shared';
import { useCallback, useRef, useState } from 'react';
import { storage } from '../../../storage';
import { isMarkdownFile } from '../../import/markdown/detect';
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
        let file = job.file;
        let source: { title?: string; originalFileName?: string } = {};
        if (isMarkdownFile(file)) {
          // 마크다운·텍스트는 먼저 A4 PDF로 바꾼 뒤 같은 파이프라인에 넣는다
          patch(job.item.id, { stage: 'converting' });
          try {
            // 변환기(marked·pdf-lib·fontkit)는 마크다운을 넣을 때만 내려받는다
            const { markdownFileToPdf } = await import('../../import/markdown/markdownToPdf');
            const converted = await markdownFileToPdf(file);
            file = converted.file;
            source = { title: converted.title, originalFileName: converted.originalFileName };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            patch(job.item.id, { outcome: { status: 'error', message: `변환 실패: ${message}` } });
            continue;
          }
        }
        const outcome = await importPdfFile(file, {
          storage,
          analyze: analyzePdf,
          folderId: job.folderId,
          onStage: (stage) => patch(job.item.id, { stage }),
          ...source,
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
