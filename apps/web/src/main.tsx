import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { setupInstallPrompt } from './features/pwa/installPrompt';
import './styles.css';

// 설치 이벤트는 앱이 그려지기 전에도 올 수 있어 가장 먼저 잡아 둔다
setupInstallPrompt();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('#root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
