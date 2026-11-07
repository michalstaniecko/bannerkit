// M1 #14: AutoFit turned on in the Inspector. The used font size the Inspector shows
// (core Text Layout with the browser's measure) is the `fontSize` `bannerkit inspect`
// reports for the saved Document (core Text Layout with the server's measure).
import type { Document } from '@bannerkit/core'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from './fixtures.ts'
import { repoRoot } from './root.ts'

const banner: Document = {
  version: 1,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [
    {
      id: 'text-1',
      type: 'text',
      x: 20,
      y: 20,
      width: 300,
      text: 'Summer sale up to fifty percent off',
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: 48,
      fill: '#000000',
    },
  ],
}

const bannerkit = (...args: string[]) =>
  promisify(execFile)(process.execPath, [join(repoRoot, 'packages/server/bin/bannerkit.js'), ...args])

test('the used font size after AutoFit matches bannerkit inspect', async ({ page, projects }) => {
  await projects.write('m1-autofit', { documents: { banner } })
  await page.goto(projects.appUrl('m1-autofit', 'banner'))
  await expect(page.locator('.save')).toHaveText('Saved')
  await page.locator('.layer-list [data-layer-id="text-1"]').click()
  const inspector = page.getByRole('complementary', { name: 'Inspector' })

  // Turned on without a height: the text keeps its Text Layout height, so nothing shrinks yet.
  await inspector.getByRole('checkbox', { name: 'AutoFit' }).check()
  await expect.poll(async () => (await projects.read('m1-autofit', 'banner')).layers[0]).toMatchObject({ autoFit: { minFontSize: 24 } })
  const height = inspector.getByRole('textbox', { name: 'Height', exact: true })
  await height.fill('60')
  await height.press('Enter')
  await expect.poll(async () => (await projects.read('m1-autofit', 'banner')).layers[0]).toMatchObject({ height: 60 })
  await expect(page.locator('.save')).toHaveText('Saved')

  const used = Number(await inspector.getByRole('status', { name: 'Used font size' }).textContent())
  const { stdout } = await bannerkit('inspect', 'm1-autofit', 'banner', '--root', projects.root, '--json')
  const { text } = JSON.parse(stdout).result.layers[0]

  expect(text.requestedFontSize).toBe(48)
  await expect(inspector.getByRole('textbox', { name: 'Font size', exact: true })).toHaveValue('48')
  expect(used).toBeLessThan(48)
  expect(used).toBe(text.fontSize)
})
