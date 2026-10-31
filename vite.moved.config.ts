import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

// The page served at the old address, https://jonathan-a-white.github.io/spell-forge/ (mw-79en7t.22): moved/index.html and src/moved/, built to
// dist-moved/ for GitHub Pages (`npm run build:moved`, .github/workflows/deploy.yml). It is not the app: no plugins, no worker of the app's own
// (moved/public/sw.js only ends the old app's cache). The base is the old address's path.
export default defineConfig({
  root: fileURLToPath(new URL('./moved', import.meta.url)),
  publicDir: fileURLToPath(new URL('./moved/public', import.meta.url)),
  base: '/spell-forge/',
  build: {
    outDir: fileURLToPath(new URL('./dist-moved', import.meta.url)),
    emptyOutDir: true,
  },
  server: { fs: { allow: ['.'] } },
})
