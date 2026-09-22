import { useRef, useState, type DragEvent, type ReactNode } from 'react';

interface DropzoneProps {
  onFiles: (files: File[]) => void;
  children: ReactNode;
}

/** 자식 영역 전체를 드롭 대상으로 만들고, 끌어오는 동안 안내 오버레이를 띄운다 */
export function Dropzone({ onFiles, children }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);

  function hasFiles(event: DragEvent) {
    return Array.from(event.dataTransfer.types).includes('Files');
  }

  function onDragEnter(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    depth.current += 1;
    setDragging(true);
  }

  function onDragOver(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function onDragLeave(event: DragEvent<HTMLDivElement>) {
    if (!hasFiles(event)) return;
    depth.current = Math.max(0, depth.current - 1);
    if (depth.current === 0) setDragging(false);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    depth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(files);
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative min-h-[60vh]"
      data-dropzone
    >
      {children}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/80">
          <p className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-indigo-700 shadow">
            여기에 놓으면 이 폴더로 가져옵니다
          </p>
        </div>
      )}
    </div>
  );
}
