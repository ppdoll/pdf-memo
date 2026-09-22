import { newId } from '@pdf-memo/shared';
import { useCallback, useRef, useState } from 'react';
import { storage } from '../../../storage';
import { HEIC_MESSAGE, imagesTitle, isHeicFile, isImageFile } from '../../import/images/detect';
import { isJsonFile } from '../../import/json/detect';
import { isMarkdownFile } from '../../import/markdown/detect';
import { analyzePdf } from '../../viewer/pdf/analyze';
import { importJsonFile } from './importJson';
import { importPdfFile, type ImportOutcome, type ImportStage } from './importPdf';

export interface ImportItem {
  id: string;
  fileName: string;
  stage: ImportStage | 'queued';
  outcome?: ImportOutcome;
}

interface ImportJob {
  item: ImportItem;
  /** 보통 파일 하나. 이미지를 한 문서로 묶을 때만 여러 개 */
  files: File[];
  folderId: string;
}

export interface ImportFilesOptions {
  /** 이미지 여러 장을 한 문서(여러 페이지)로 묶는다. 이미지가 아닌 파일은 각각 처리 */
  mergeImages?: boolean;
}

interface PdfSource {
  file: File;
  title?: string;
  originalFileName?: string;
}

/**
 * 파일 종류에 따라 PDF로 바꾼다. 변환기(pdf-lib·marked·fontkit)는 필요할 때만 내려받는다.
 * PDF는 그대로 돌려준다.
 */
async function toPdfSource(
  files: File[],
  onStage: (stage: ImportStage) => void,
): Promise<PdfSource> {
  const [first] = files;
  if (files.length > 1 || isImageFile(first)) {
    if (files.some(isHeicFile)) throw new Error(HEIC_MESSAGE);
    onStage('converting');
    const { imageFilesToPdf } = await import('../../import/images/imagesToPdf');
    const converted = await imageFilesToPdf(files);
    return {
      file: converted.file,
      title: converted.title,
      originalFileName: converted.originalFileName,
    };
  }
  if (isMarkdownFile(first)) {
    onStage('converting');
    const { markdownFileToPdf } = await import('../../import/markdown/markdownToPdf');
    const converted = await markdownFileToPdf(first);
    return {
      file: converted.file,
      title: converted.title,
      originalFileName: converted.originalFileName,
    };
  }
  return { file: first };
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
        if (job.files.length === 1 && isJsonFile(job.files[0])) {
          // JSON은 PDF로 바꾸지 않고 그대로 저장해 트리 뷰어로 연다
          const jsonOutcome = await importJsonFile(job.files[0], {
            storage,
            folderId: job.folderId,
            onStage: (stage) => patch(job.item.id, { stage }),
          });
          patch(job.item.id, { outcome: jsonOutcome });
          continue;
        }
        let source: PdfSource;
        try {
          source = await toPdfSource(job.files, (stage) => patch(job.item.id, { stage }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          patch(job.item.id, { outcome: { status: 'error', message: `변환 실패: ${message}` } });
          continue;
        }
        const outcome = await importPdfFile(source.file, {
          storage,
          analyze: analyzePdf,
          folderId: job.folderId,
          onStage: (stage) => patch(job.item.id, { stage }),
          title: source.title,
          originalFileName: source.originalFileName,
        });
        patch(job.item.id, { outcome });
      }
    } finally {
      runningRef.current = false;
    }
  }, [patch]);

  const importFiles = useCallback(
    (files: File[], folderId: string, options: ImportFilesOptions = {}) => {
      if (files.length === 0) return;
      const single = (file: File): ImportJob => ({
        item: { id: newId(), fileName: file.name, stage: 'queued' },
        files: [file],
        folderId,
      });
      const jobs: ImportJob[] = [];
      if (options.mergeImages) {
        const images = files.filter(isImageFile);
        const others = files.filter((file) => !isImageFile(file));
        if (images.length > 0) {
          jobs.push({
            item: { id: newId(), fileName: imagesTitle(images), stage: 'queued' },
            files: images,
            folderId,
          });
        }
        jobs.push(...others.map(single));
      } else {
        jobs.push(...files.map(single));
      }
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
