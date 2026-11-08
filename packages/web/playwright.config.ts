// S3: the full app in Playwright's bundled Chromium (`pnpm test:e2e`).
//
// One run = one temporary projects root, seeded with a copy of examples/ (see
// e2e/root.ts). Two servers start against it: the Hono server (REST + Assets) and
// Vite in dev mode proxying /api to it, so pages share one origin. Vite also
// serves e2e/harness.html, a page exposing the editor module and core to tests.
// Tests may write Projects into the root at any time; the server reads from disk.
import { defineConfig, devices } from '@playwright/test'
import { E2E_ROOT_ENV, projectsRoot } from './e2e/root.ts'

const API_PORT = 8797
const WEB_PORT = 5197
const root = projectsRoot()

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: true,
  reporter: 'list',
  globalTeardown: './e2e/teardown.ts',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `pnpm -F @bannerkit/server serve --root "${root}" --port ${API_PORT}`,
      url: `http://127.0.0.1:${API_PORT}/api/projects`,
      reuseExistingServer: false,
      stdout: 'pipe',
    },
    {
      command: `pnpm exec vite --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}/e2e/harness.html`,
      reuseExistingServer: false,
      env: { BANNERKIT_API: `http://127.0.0.1:${API_PORT}`, [E2E_ROOT_ENV]: root },
    },
  ],
})
