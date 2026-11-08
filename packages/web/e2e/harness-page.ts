// Runs in the browser on e2e/harness.html (served by Vite in dev, never built):
// exposes the editor module and core to S3 tests as `window.bannerkit`, so a test
// can drive them with `page.evaluate` in real Chromium.
import * as core from '@bannerkit/core'
import { createEditor } from '../src/editor/index.ts'
import * as fonts from '../src/editor/fonts.ts'

const harness = { core, createEditor, fonts, host: () => document.getElementById('host')! }

export type Harness = typeof harness

declare global {
  interface Window {
    bannerkit: Harness
  }
}

window.bannerkit = harness
