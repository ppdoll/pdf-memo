import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';
import pkg from './package.json';
import { APP_DESCRIPTION, APP_NAME, APP_SHORT_NAME } from './src/app/brand';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: APP_NAME,
        short_name: APP_SHORT_NAME,
        description: APP_DESCRIPTION,
        lang: 'ko',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f8fafc',
        theme_color: '#4f46e5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,woff2}'],
        // API 요청은 SPA 폴백(index.html)으로 가로채지 않는다.
        navigateFallbackDenylist: [/^\/api\//],
        // 텍스트 폰트(약 1.5MB)는 프리캐시하지 않고 처음 쓸 때 받아 오래 보관한다.
        runtimeCaching: [
          {
            urlPattern: /\/assets\/.*\.(?:otf|ttf)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // qpdf(암호 해제, 약 1.3MB)도 암호 걸린 PDF를 처음 만날 때 받아 오래 보관한다.
            urlPattern: /\/assets\/.*\.wasm$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'wasm',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  optimizeDeps: {
    // 워커 안에서만 쓰는 CommonJS 글루 코드. 미리 번들해 두지 않으면 dev에서 워커의 첫 요청이 실패한다.
    include: ['@neslinesli93/qpdf-wasm'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
