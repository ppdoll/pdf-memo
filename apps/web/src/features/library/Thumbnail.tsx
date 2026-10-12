import { useEffect, useState } from 'react';
import { useBlobUrl } from '../../lib/useBlobUrl';
import { storage } from '../../storage';

interface ThumbnailProps {
  assetId: string | null;
  alt: string;
  className?: string;
  /** 자리표시자 모양 */
  kind?: 'pdf' | 'json' | 'table';
}

/** 저장된 썸네일 Asset을 표시. 없으면 PDF 아이콘 자리표시자 */
export function Thumbnail({ assetId, alt, className = '', kind = 'pdf' }: ThumbnailProps) {
  const [blob, setBlob] = useState<Blob | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBlob(null);
    if (!assetId) return;
    storage.assets
      .get(assetId)
      .then((asset) => {
        if (!cancelled) setBlob(asset?.data ?? null);
      })
      .catch((error: unknown) => console.error('[Thumbnail]', error));
    return () => {
      cancelled = true;
    };
  }, [assetId]);

  const url = useBlobUrl(blob);

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 text-slate-300 ${className}`}
        aria-hidden
      >
        {kind === 'json' ? (
          <span className="font-mono text-3xl font-semibold text-amber-400">{'{ }'}</span>
        ) : kind === 'table' ? (
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10 text-emerald-400"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            data-thumbnail-table
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="h-10 w-10"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />
            <path d="M14 3v5h5" />
            <path d="M9 13h6M9 17h6" />
          </svg>
        )}
      </div>
    );
  }

  return (
    <img src={url} alt={alt} className={`object-cover object-top ${className}`} loading="lazy" />
  );
}
