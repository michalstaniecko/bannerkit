// S3: the JSON panel shows the live Document; pasted JSON is validated before Apply.
import type { Document } from '@bannerkit/core'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

const banner: Document = {
  version: 1,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x: 40, y: 40, width: 100, height: 60, fill: '#ff0000' }],
}

async function open(page: Page, url: string) {
  await page.goto(url)
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect(page.locator('.save')).toHaveText('Saved')
}

const panelText = (page: Page) => page.locator('.json-panel .cm-content')

/** Replaces the panel text the way a paste does. */
async function paste(page: Page, text: string) {
  await panelText(page).click()
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.insertText(text)
}

/** The panel text, parsed (CodeMirror renders one element per line). */
async function shownDocument(page: Page): Promise<Document> {
  const lines = await page.locator('.json-panel .cm-line').allInnerTexts()
  return JSON.parse(lines.join('\n'))
}

test('the JSON panel shows the live Document and follows Canvas edits', async ({ page, projects }) => {
  await projects.write('s3-json-live', { documents: { banner } })
  await open(page, projects.appUrl('s3-json-live', 'banner'))

  await expect.poll(() => shownDocument(page)).toEqual(banner)

  const at = (await page.locator('canvas.upper-canvas').boundingBox())!
  const zoom = at.width / banner.canvas.width
  await page.mouse.click(at.x + 90 * zoom, at.y + 70 * zoom)
  await page.keyboard.press('ArrowRight')

  await expect.poll(async () => (await shownDocument(page)).layers[0]!.x).toBe(41)
})

test('pasting invalid JSON shows errors inline and leaves the Document unchanged', async ({ page, projects }) => {
  await projects.write('s3-json-invalid', { documents: { banner } })
  await open(page, projects.appUrl('s3-json-invalid', 'banner'))

  const typo = { ...banner, layers: [{ ...banner.layers[0], fil: '#00ff00' }] }
  await paste(page, JSON.stringify(typo, null, 2))
  await page.getByRole('button', { name: 'Apply' }).click()

  const errors = page.locator('.json-panel .json-errors li')
  await expect(errors).toHaveCount(1)
  await expect(errors.first()).toContainText('layers[0].fil')
  await expect(errors.first()).toContainText('did you mean "fill"')

  await paste(page, '{ "version": 1,')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(errors.first()).toContainText('Invalid JSON')

  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await expect(page.locator('.save')).toHaveText('Saved')
  expect(await projects.read('s3-json-invalid', 'banner')).toEqual(banner)
})

test('applying valid JSON replaces the Document as one undo step', async ({ page, projects }) => {
  await projects.write('s3-json-apply', { documents: { banner } })
  await open(page, projects.appUrl('s3-json-apply', 'banner'))

  const edited: Document = { ...banner, layers: [{ ...banner.layers[0]!, fill: '#0000ff' }] as Document['layers'] }
  await paste(page, JSON.stringify(edited, null, 2))
  await page.getByRole('button', { name: 'Apply' }).click()

  await expect(page.locator('.json-panel .json-errors li')).toHaveCount(0)
  await expect.poll(() => projects.read('s3-json-apply', 'banner')).toEqual(edited)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => shownDocument(page)).toEqual(banner)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()
})

test('a Canvas edit does not overwrite JSON the human is still editing', async ({ page, projects }) => {
  await projects.write('s3-json-typing', { documents: { banner } })
  await open(page, projects.appUrl('s3-json-typing', 'banner'))

  await paste(page, '{ "half": "typed"')
  const at = (await page.locator('canvas.upper-canvas').boundingBox())!
  const zoom = at.width / banner.canvas.width
  await page.mouse.click(at.x + 90 * zoom, at.y + 70 * zoom)
  await page.keyboard.press('ArrowRight')

  await expect.poll(async () => (await projects.read('s3-json-typing', 'banner')).layers[0]!.x).toBe(41)
  await expect(page.locator('.json-panel .json-stale')).toBeVisible()
  await expect(panelText(page)).toHaveText('{ "half": "typed"')

  await page.getByRole('button', { name: 'Revert' }).click()
  expect((await shownDocument(page)).layers[0]!.x).toBe(41)
})
