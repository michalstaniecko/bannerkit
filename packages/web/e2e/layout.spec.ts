// M1 #6: the editor window: top bar, Layer list (left), Canvas area (centre) with room
// for rulers and an overlay, Inspector (right) with "Properties" and "JSON" tabs.
import type { Document } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

const banner: Document = {
  version: 2,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x: 40, y: 40, width: 100, height: 60, fill: '#ff0000' }],
}

test('the window has a top bar, the Layer list, the Canvas area and the Inspector, left to right', async ({ page, projects }) => {
  await projects.write('m1-layout', { documents: { banner } })
  await page.goto(projects.appUrl('m1-layout', 'banner'))
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()

  const topbar = (await page.getByRole('banner').boundingBox())!
  const layers = (await page.getByRole('complementary', { name: 'Layers' }).boundingBox())!
  const canvasArea = (await page.locator('.canvas-area').boundingBox())!
  const inspector = (await page.getByRole('complementary', { name: 'Inspector' }).boundingBox())!

  expect(topbar.y + topbar.height).toBeLessThanOrEqual(layers.y)
  expect(layers.x + layers.width).toBeLessThanOrEqual(canvasArea.x)
  expect(canvasArea.x + canvasArea.width).toBeLessThanOrEqual(inspector.x)
  for (const box of [layers, canvasArea, inspector]) expect(box.y).toBe(layers.y)

  // The top bar's actions are icon buttons, named for assistive tech.
  for (const name of ['Undo', 'Redo', 'Zoom out', 'Zoom in', 'Fit', 'Add text', 'Add rect', 'Add image', 'Delete', 'Export']) {
    await expect(page.getByRole('banner').getByRole('button', { name, exact: true })).toBeVisible()
  }
})

test('the Inspector opens on Properties; its JSON tab shows the Document', async ({ page, projects }) => {
  await projects.write('m1-inspector-tabs', { documents: { banner } })
  await page.goto(projects.appUrl('m1-inspector-tabs', 'banner'))
  await expect(page.locator('.save')).toHaveText('Saved')

  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  await expect(inspector.getByRole('tab')).toHaveText(['Properties', 'JSON'])
  await expect(inspector.getByRole('tab', { name: 'Properties' })).toHaveAttribute('aria-selected', 'true')
  await expect(inspector.getByRole('tabpanel', { name: 'Properties' })).toBeVisible()
  await expect(inspector.locator('.json-panel')).toBeHidden()

  await inspector.getByRole('tab', { name: 'JSON' }).click()
  await expect(inspector.getByRole('tabpanel', { name: 'JSON' })).toBeVisible()
  await expect(inspector.locator('.json-panel .cm-content')).toContainText('"rect-1"')
})

test('the Canvas area reserves the ruler gutters and an overlay over the Canvas', async ({ page, projects }) => {
  await projects.write('m1-canvas-area', { documents: { banner } })
  await page.goto(projects.appUrl('m1-canvas-area', 'banner'))
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()

  const area = page.locator('.canvas-area')
  await expect(area.locator('.ruler-top')).toHaveCount(1)
  await expect(area.locator('.ruler-left')).toHaveCount(1)
  await expect(area.locator('.ruler-corner')).toHaveCount(1)

  // The overlay covers the Canvas exactly, whatever the zoom, and lets clicks through.
  const canvas = (await page.locator('canvas.upper-canvas').boundingBox())!
  const overlay = area.locator('.canvas-overlay')
  await expect.poll(async () => await overlay.boundingBox()).toEqual(canvas)
  await expect(overlay).toHaveCSS('pointer-events', 'none')
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const zoomed = (await page.locator('canvas.upper-canvas').boundingBox())!
  await expect.poll(async () => (await overlay.boundingBox())?.width).toBeCloseTo(zoomed.width, 0)
})
