import { createBrowserRouter } from 'react-router';
import { LibraryPage } from '../features/library/LibraryPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { TrashPage } from '../features/trash/TrashPage';
import { DocumentPage } from '../features/viewer/DocumentPage';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <LibraryPage /> },
      { path: 'f/:folderId', element: <LibraryPage /> },
      { path: 'trash', element: <TrashPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  // 뷰어는 전체 화면을 쓰므로 앱 레이아웃(헤더·최대 폭) 밖에 둔다
  { path: '/d/:documentId', element: <DocumentPage /> },
]);
