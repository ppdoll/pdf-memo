import type { PdfDocument } from '@pdf-memo/shared';
import { Link } from 'react-router';
import { formatRelative } from '../../lib/format';
import { formatBytes } from '../../lib/quota';
import { Thumbnail } from './Thumbnail';

interface DocumentCardProps {
  doc: PdfDocument;
  onRename: (doc: PdfDocument) => void;
  onTrash: (doc: PdfDocument) => void;
  onExport: (doc: PdfDocument) => void;
  /** 이 문서를 내보내는 중이면 true */
  exporting?: boolean;
}

export function DocumentCard({
  doc,
  onRename,
  onTrash,
  onExport,
  exporting = false,
}: DocumentCardProps) {
  return (
    <li className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white transition hover:border-indigo-300 hover:shadow-sm">
      <Link to={`/d/${doc.id}`} className="block">
        <Thumbnail
          assetId={doc.thumbnailAssetId}
          alt=""
          className="h-40 w-full border-b border-slate-100"
        />
        <div className="p-3">
          <p className="truncate text-sm font-medium text-slate-900" title={doc.title}>
            {doc.title}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {doc.pageCount}쪽 · {formatBytes(doc.byteSize)} · {formatRelative(doc.updatedAt)}
          </p>
        </div>
      </Link>
      <div
        className={`absolute top-2 right-2 flex gap-1 transition focus-within:opacity-100 group-hover:opacity-100 ${
          exporting ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={() => onExport(doc)}
          disabled={exporting}
          className="rounded-md bg-white/90 px-2 py-1 text-xs text-slate-600 shadow hover:text-indigo-700 disabled:opacity-60"
          title="필기 포함 PDF 저장"
        >
          {exporting ? '내보내는 중…' : 'PDF'}
        </button>
        <button
          type="button"
          onClick={() => onRename(doc)}
          className="rounded-md bg-white/90 px-2 py-1 text-xs text-slate-600 shadow hover:text-slate-900"
        >
          이름
        </button>
        <button
          type="button"
          onClick={() => onTrash(doc)}
          className="rounded-md bg-white/90 px-2 py-1 text-xs text-slate-600 shadow hover:text-red-600"
          aria-label={`${doc.title} 휴지통으로`}
        >
          휴지통
        </button>
      </div>
    </li>
  );
}
