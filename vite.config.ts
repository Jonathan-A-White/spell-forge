import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'node:url'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/spell-forge/',
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
