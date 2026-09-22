import { useCallback, useRef, useState } from 'react';
import { storage } from '../../storage';
import { downloadFile, shareFile } from './download';
import { exportDocument, type ExportKind } from './exportService';

export type ExportAction = 'download' | 'share';

export interface ExportState {
  busy: boolean;
  /** 진행 중인 문서 id */
  documentId: string | null;
  progress: string | null;
  error: string | null;
  info: string | null;
}

const IDLE: ExportState = {
  busy: false,
  documentId: null,
  progress: null,
  error: null,
  info: null,
};

interface RunOptions {
  /** 내보내기 직전에 실행 (예: 세션 쓰기 큐 flush) */
  before?: () => Promise<void>;
}

/** 내보내기 실행 상태. 한 번에 하나만 실행한다 */
export function useExport() {
  const [state, setState] = useState<ExportState>(IDLE);
  const busyRef = useRef(false);

  const run = useCallback(
    async (
      documentId: string,
      kind: ExportKind,
      action: ExportAction,
      options: RunOptions = {},
    ) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setState({ busy: true, documentId, progress: '준비 중…', error: null, info: null });
      try {
        await options.before?.();
        const result = await exportDocument(storage, documentId, kind, {
          onProgress: (done, total) =>
            setState((s) => ({ ...s, progress: `필기 굽는 중… ${done}/${total} 페이지` })),
        });
        setState((s) => ({
          ...s,
          progress: action === 'share' ? '공유 시트 여는 중…' : '저장 중…',
        }));
        let info: string | null = null;
        if (action === 'share') {
          const shared = await shareFile(result.file, result.file.name);
          info = shared ? '공유했습니다' : null;
        } else {
          downloadFile(result.file);
          info = `${result.file.name} 저장`;
        }
        if (result.skipped > 0) {
          info = `${info ?? ''} · 아직 지원하지 않는 객체 ${result.skipped}개는 제외됨`.trim();
        }
        setState({ ...IDLE, info });
      } catch (error) {
        setState({ ...IDLE, error: error instanceof Error ? error.message : String(error) });
      } finally {
        busyRef.current = false;
      }
    },
    [],
  );

  const clear = useCallback(() => setState(IDLE), []);

  return { state, run, clear };
}
