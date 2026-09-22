import type { PdfDocument } from '@pdf-memo/shared';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { formatRelative } from '../../lib/format';
import { useSubscribable } from '../../lib/useSubscribable';
import { storage } from '../../storage';
import { Thumbnail } from './Thumbnail';

const EMPTY: PdfDocument[] = [];

export function RecentDocuments() {
  const source = useMemo(() => storage.documents.watchRecent(6), []);
  const recent = useSubscribable(source, EMPTY);
  if (recent.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 text-xs font-medium tracking-wide text-slate-500 uppercase">최근 문서</h2>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {recent.map((doc) => (
          <li key={doc.id} className="w-32 shrink-0">
            <Link
              to={`/d/${doc.id}`}
              className="block rounded-lg border border-slate-200 bg-white p-2 hover:border-indigo-300"
            >
              <Thumbnail assetId={doc.thumbnailAssetId} alt="" className="h-24 w-full rounded" />
              <p className="mt-2 truncate text-xs font-medium" title={doc.title}>
                {doc.title}
              </p>
              <p className="text-[11px] text-slate-500">
                {doc.lastOpenedAt ? formatRelative(doc.lastOpenedAt) : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
