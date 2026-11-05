// S3 fixtures, shared by every spec in e2e/:
// - `harness`: a page on e2e/harness.html with `window.bannerkit` ready (the editor
//   module + core in real Chromium); drive it with `harness.evaluate(...)`.
// - `projects`: writes Projects (project.json, Documents, Assets) into the run's
//   temporary projects root, which the server reads live.
// Specs import `test` and `expect` from here instead of '@playwright/test'.
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Document } from '@bannerkit/core'
import { test as base, expect, type Page } from '@playwright/test'
import { projectsRoot } from './root.ts'

export type Projects = {
  /** The run's projects root. */
  root: string
  /** Creates (or overwrites) a Project with Documents and Assets (file name → contents). */
  write(project: string, contents: { documents?: Record<string, Document>; assets?: Record<string, string | Uint8Array> }): Promise<void>
  /** The editor app URL that opens `project`/`doc`. */
  appUrl(project: string, doc: string): string
}

export const test = base.extend<{ harness: Page; projects: Projects }>({
  harness: async ({ page }, use) => {
    await page.goto('/e2e/harness.html')
    await page.waitForFunction(() => window.bannerkit !== undefined)
    await use(page)
  },
  projects: async ({}, use) => {
    const root = projectsRoot()
    await use({
      root,
      async write(project, { documents = {}, assets = {} }) {
        const dir = join(root, project)
        await mkdir(join(dir, 'documents'), { recursive: true })
        await mkdir(join(dir, 'assets'), { recursive: true })
        await writeFile(join(dir, 'project.json'), JSON.stringify({ version: 1, name: project }))
        for (const [name, document] of Object.entries(documents)) {
          await writeFile(join(dir, 'documents', `${name}.json`), JSON.stringify(document, null, 2))
        }
        for (const [name, data] of Object.entries(assets)) await writeFile(join(dir, 'assets', name), data)
      },
      appUrl: (project, doc) => `/?project=${encodeURIComponent(project)}&doc=${encodeURIComponent(doc)}`,
    })
  },
})

export { expect }
