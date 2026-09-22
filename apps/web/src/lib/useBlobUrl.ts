import { useEffect, useState } from 'react';

/** Blob을 <img src>로 쓸 수 있는 object URL로 바꾸고, 바뀌거나 언마운트되면 해제한다 */
export function useBlobUrl(blob: Blob | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}
