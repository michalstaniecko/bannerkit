// The Canvas resize handles: dragging the bottom edge previews the size with a `W × H`
// label while the zoom holds still, and the release is saved to the file, after which
// Fit mode zooms to the new size.
import type { Document } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

// Tall, so Fit is limited by the height and zooms in when the Canvas gets shorter.
const banner: Document = {
  version: 2,
  name: 'banner',
  canvas: { width: 200, height: 800, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x: 50, y: 50, width: 100, height: 100, fill: '#ff0000' }],
}

test('dragging a Canvas handle resizes the Canvas and saves the file', async ({ page, projects }) => {
  await projects.write('canvas-handles', { documents: { banner } })
  await page.goto(projects.appUrl('canvas-handles', 'banner'))
  const canvas = page.locator('canvas.upper-canvas')
  await expect(canvas).toBeVisible()
  await expect(page.locator('.save')).toHaveText('Saved')
  const zoom = page.locator('.zoom')
  const fitted = await zoom.innerText()

  const handle = page.getByLabel('Canvas handle: bottom edge')
  const box = (await handle.boundingBox())!
  const scale = (await canvas.boundingBox())!.height / banner.canvas.height
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  // Half the Canvas height up, in screen px: the Canvas becomes 200 × 400.
  await page.mouse.move(x, y - 200 * scale, { steps: 5 })
  await page.mouse.move(x, y - 400 * scale, { steps: 5 })
  await expect(page.locator('.canvas-size-label')).toHaveText(/^200 × (39|40)\d$/)
  await expect(zoom).toHaveText(fitted)
  await page.mouse.up()

  await expect(page.locator('.canvas-size-label')).toHaveCount(0)
  await expect.poll(async () => (await projects.read('canvas-handles', 'banner')).canvas.height).toBeCloseTo(400, -1)
  const saved = await projects.read('canvas-handles', 'banner')
  // The top edge stayed put, so the Layers did not move.
  expect(saved.canvas.width).toBe(200)
  expect(saved.layers[0]).toMatchObject({ x: 50, y: 50, width: 100, height: 100 })
  await expect(page.locator('.save')).toHaveText('Saved')
  await expect.poll(() => zoom.innerText()).not.toBe(fitted)
  await expect(page.locator('.error')).toHaveCount(0)
})
