// S3: direct manipulation in the editor app, autosaved to the Document file on disk.
import type { Document, LeafLayer } from '@bannerkit/core'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

const banner: Document = {
  version: 2,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [
    { id: 'rect-1', type: 'rect', x: 40, y: 40, width: 100, height: 60, fill: '#ff0000' },
    {
      id: 'text-1',
      type: 'text',
      x: 200,
      y: 120,
      width: 180,
      text: 'Summer sale',
      fontFamily: 'Inter',
      fontWeight: 800,
      fontSize: 32,
      fill: '#000000',
    },
  ],
}

/** Opens `project`/banner and returns a mapper from Document px to page px. */
async function open(page: Page, url: string) {
  await page.goto(url)
  const canvas = page.locator('canvas.upper-canvas')
  await expect(canvas).toBeVisible()
  await expect(page.locator('.save')).toHaveText('Saved')
  const box = (await canvas.boundingBox())!
  const zoom = box.width / banner.canvas.width
  return (x: number, y: number) => ({ x: box.x + x * zoom, y: box.y + y * zoom, zoom })
}

test('dragging a Layer is autosaved to the Document file', async ({ page, projects }) => {
  await projects.write('s3-drag', { documents: { banner } })
  const at = await open(page, projects.appUrl('s3-drag', 'banner'))

  const from = at(90, 70)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 20 * from.zoom, from.y + 10 * from.zoom, { steps: 5 })
  await page.mouse.move(from.x + 40 * from.zoom, from.y + 20 * from.zoom, { steps: 5 })
  await page.mouse.up()

  await expect(page.locator('.save')).toHaveText('Saved')
  // The fitted zoom turns whole page px into fractional Document px.
  await expect.poll(async () => ((await projects.read('s3-drag', 'banner')).layers[0] as LeafLayer).x).toBeCloseTo(80, 0)
  const [rect] = (await projects.read('s3-drag', 'banner')).layers as LeafLayer[]
  expect(rect!.y).toBeCloseTo(60, 0)
  expect(rect).toMatchObject({ width: 100, height: 60 })
  await expect(page.locator('.error')).toHaveCount(0)
})

test('arrow keys nudge the selected Layer by 1px, Shift by 10px', async ({ page, projects }) => {
  await projects.write('s3-nudge', { documents: { banner } })
  const at = await open(page, projects.appUrl('s3-nudge', 'banner'))
  const rect = at(90, 70)
  await page.mouse.click(rect.x, rect.y)

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')

  await expect.poll(async () => (await projects.read('s3-nudge', 'banner')).layers[0]).toMatchObject({ x: 41, y: 50 })
})

test('double-clicking a text Layer edits it inline; leaving the edit saves the text', async ({ page, projects }) => {
  await projects.write('s3-text', { documents: { banner } })
  const at = await open(page, projects.appUrl('s3-text', 'banner'))
  const text = at(240, 135)

  await page.mouse.dblclick(text.x, text.y)
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('Winter sale')
  const empty = at(380, 20)
  await page.mouse.click(empty.x, empty.y)

  await expect.poll(async () => (await projects.read('s3-text', 'banner')).layers[1]).toMatchObject({ text: 'Winter sale', x: 200, y: 120, width: 180 })
})

test('Undo and Redo in the top bar, and their shortcuts, step whole drags and are autosaved', async ({ page, projects }) => {
  await projects.write('s3-undo', { documents: { banner } })
  const at = await open(page, projects.appUrl('s3-undo', 'banner'))
  const undo = page.getByRole('button', { name: 'Undo' })
  const redo = page.getByRole('button', { name: 'Redo' })
  const rectOnDisk = async () => (await projects.read('s3-undo', 'banner')).layers[0] as LeafLayer
  await expect(undo).toBeDisabled()
  await expect(redo).toBeDisabled()

  const from = at(90, 70)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 40 * from.zoom, from.y + 20 * from.zoom, { steps: 10 })
  await page.mouse.up()
  await expect.poll(async () => (await rectOnDisk()).x).toBeCloseTo(80, 0)

  await undo.click()
  await expect.poll(rectOnDisk).toMatchObject({ x: 40, y: 40 })
  await expect(undo).toBeDisabled()
  await expect(redo).toBeEnabled()

  await redo.click()
  await expect.poll(async () => (await rectOnDisk()).x).toBeCloseTo(80, 0)

  await page.keyboard.press('ControlOrMeta+Z')
  await expect.poll(rectOnDisk).toMatchObject({ x: 40, y: 40 })
  await page.keyboard.press('ControlOrMeta+Shift+Z')
  await expect.poll(async () => (await rectOnDisk()).x).toBeCloseTo(80, 0)
  await expect(page.locator('.save')).toHaveText('Saved')
})
