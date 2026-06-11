import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// Amma's Codex - offline-first PWA. The service worker precaches the app shell and
// self-hosted fonts so the kitchen never waits on the network. All cooking data lives
// in IndexedDB + OPFS (see src/db, src/media), never in the SW cache.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'favicon.svg'],
      // Test the offline shell in dev too.
      devOptions: { enabled: true, type: 'module' },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
        // Don't let the SW try to cache opaque/cross-origin or huge media; media is OPFS.
        navigateFallback: 'index.html',
      },
      manifest: {
        name: "Amma's Codex",
        short_name: 'Codex',
        description: 'A capture journal for how Amma cooks.',
        lang: 'en',
        theme_color: '#BE5E37',
        background_color: '#F5EDE1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
    }),
  ],
  server: { host: true },
})
