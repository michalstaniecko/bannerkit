// The Inspector of the Document (empty Selection): a new Canvas size from the Anchor is
// saved to the file, and Fit mode zooms to the new size after the resize, its undo and
// a reload from disk (e.g. after `bannerkit doc resize`).
import type { Document } from '@bannerkit/core'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

const banner = (width: number, height: number): Document => ({
  version: 2,
  name: 'banner',
  canvas: { width, height, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x: 100, y: 50, width: 100, height: 100, fill: '#ff0000' }],
})

const zoom = (page: Page) => page.locator('.zoom').innerText()

test('a Canvas size typed in the Inspector is saved, and Fit zooms to it after the change, undo and a reload', async ({ page, projects }) => {
  await projects.write('doc-inspector', { documents: { banner: banner(400, 200) } })
  await page.goto(projects.appUrl('doc-inspector', 'banner'))
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect(page.locator('.save')).toHaveText('Saved')
  const fitted = await zoom(page)

  await page.getByRole('radio', { name: 'center' }).check()
  const height = page.getByRole('textbox', { name: 'Height' })
  await height.fill('1600')
  await height.press('Enter')

  await expect.poll(() => projects.read('doc-inspector', 'banner')).toMatchObject({
    canvas: { width: 400, height: 1600 },
    layers: [{ x: 100, y: 750, width: 100, height: 100 }],
  })
  await expect.poll(() => zoom(page)).not.toBe(fitted)
  const tall = await zoom(page)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => zoom(page)).toBe(fitted)
  // The undo is autosaved before the file changes on disk, so the editor reloads it.
  await expect.poll(async () => (await projects.read('doc-inspector', 'banner')).canvas.height).toBe(200)
  await expect(page.locator('.save')).toHaveText('Saved')

  await projects.write('doc-inspector', { documents: { banner: banner(400, 1600) } })
  await expect(height).toHaveValue('1600')
  await expect.poll(() => zoom(page)).toBe(tall)
})
