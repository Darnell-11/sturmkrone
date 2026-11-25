/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// Auf GitHub Pages liegt das Spiel unter /<repo-name>/ – der Workflow setzt BASE_PATH.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Sturmkrone',
        short_name: 'Sturmkrone',
        description: 'Anime-Piratenabenteuer auf hoher See – zu Fuß und mit dem eigenen Schiff.',
        lang: 'de',
        theme_color: '#190D08',
        background_color: '#190D08',
        display: 'fullscreen',
        orientation: 'any',
        start_url: base,
        scope: base,
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Draco-Decoder (wasm) gehört zum Offline-Paket; der KTX2-Transcoder wird nur bei Bedarf geladen
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,json,glb,wasm}'],
        globIgnores: ['**/libs/basis/**', '**/audio/music/manifest.json'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Musik (rund 22 MB als Ogg) gehört nicht ins Offline-Paket, wird aber beim ersten Hören zwischengespeichert; ohne Datei spielt die prozedurale Musik
        runtimeCaching: [{
          urlPattern: ({ url }: { url: URL }) => url.pathname.includes('/audio/music/') && url.pathname.endsWith('.ogg'),
          handler: 'CacheFirst',
          options: { cacheName: 'sturmkrone-musik', expiration: { maxEntries: 80 }, cacheableResponse: { statuses: [200] } },
        }],
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    // die Welt-Prüfungen (Routen um alle Inseln, Blueprints, Kriegssimulation) rechnen viel: auf dem GitHub-Rechner bis zu viermal langsamer als lokal
    testTimeout: 30000,
  },
});
