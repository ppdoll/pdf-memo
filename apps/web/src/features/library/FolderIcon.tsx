import type { Folder } from '@pdf-memo/shared';
import { storage } from '../../storage';
import { useAssetUrl } from '../sticker/assets';
import { DEFAULT_FOLDER_COLOR } from './folderIconAsset';

interface FolderIconProps {
  folder: Pick<Folder, 'color' | 'iconAssetId'>;
  /** px */
  size?: number;
  className?: string;
}

/** 폴더 아이콘: 이미지가 있으면 이미지, 없으면 색 네모 */
export function FolderIcon({ folder, size = 12, className = '' }: FolderIconProps) {
  const assetId = folder.iconAssetId ?? '';
  const url = useAssetUrl(storage, assetId);
  if (assetId && url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 rounded-sm object-cover ${className}`}
        style={{ width: size, height: size }}
        draggable={false}
        data-folder-icon="image"
      />
    );
  }
  return (
    <span
      className={`inline-block shrink-0 rounded-sm ${className}`}
      style={{ width: size, height: size, background: folder.color ?? DEFAULT_FOLDER_COLOR }}
      data-folder-icon="color"
    />
  );
}
