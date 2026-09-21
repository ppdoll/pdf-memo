import { ROOT_FOLDER_ID } from '@pdf-memo/shared';
import { useParams } from 'react-router';
import { ApiStatus } from '../status/ApiStatus';
import { StorageStatus } from '../status/StorageStatus';
import { FolderPanel } from './FolderPanel';

export function LibraryPage() {
  const { folderId = ROOT_FOLDER_ID } = useParams<{ folderId: string }>();

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <FolderPanel parentId={folderId} />
      <aside className="space-y-4">
        <StorageStatus />
        <ApiStatus />
      </aside>
    </div>
  );
}
