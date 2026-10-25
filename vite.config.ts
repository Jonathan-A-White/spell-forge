import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'node:url'
import { appBase } from './scripts/app-base.mjs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // 'prompt': a new build waits until a grown-up taps Update now (src/features/update).
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // public/manifest.json is the app's own and index.html links it; the plugin writes none of its own.
      manifest: false,
      injectManifest: {
        // The app shell and everything the build emits for the themes and screens (scripts, styles, fonts, icons), plus the
        // manifest. The 5 MB OCR language data in public/tessdata/ is over the size limit and is fetched when first used.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}', 'manifest.json'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  // /spell-forge/ for GitHub Pages; SF_BASE=/ for the VPS (scripts/app-base.mjs).
  base: appBase(process.env),
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  resolve: {
    alias: {
      // scrypt-ts's Provider class extends Node's `events` (mw-yo97u.12): without this alias
      // Vite externalizes it to an empty module for the browser and that class declaration
      // throws the moment its chunk loads. See src/bsv/browser-events.ts.
      events: fileURLToPath(new URL('./src/bsv/browser-events.ts', import.meta.url)),
    },
  },
})
