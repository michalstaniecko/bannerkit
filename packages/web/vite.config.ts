import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development Vite serves the editor and proxies /api (REST + Assets) to the
// Hono server, so the browser still sees one origin. `pnpm start` serves the
// built `dist/` from Hono instead.
const API_TARGET = process.env.BANNERKIT_API ?? 'http://127.0.0.1:8787'

export default defineConfig({
  plugins: [react()],
  // Fabric alone is ~300 kB minified; one chunk is fine for a local tool.
  build: { chunkSizeWarningLimit: 1000 },
  server: {
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
})
