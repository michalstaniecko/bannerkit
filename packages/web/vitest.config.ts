import { defineConfig } from 'vitest/config'

// S2: the editor module under jsdom, with node-canvas backing <canvas> (test-only,
// ADR 0002 amendment). It is its own Vitest project, away from the server's sharp,
// because node-canvas and libvips clash over GLib in one process.
export default defineConfig({
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
})
