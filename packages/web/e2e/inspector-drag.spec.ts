// M1 #8: dragging a number field's label in the Inspector previews the value on the
// Canvas; only the release is saved.
import type { Document, LeafLayer } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

const banner: Document = {
  version: 2,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x: 40, y: 40, width: 100, height: 60, fill: '#ff0000' }],
}

test('dragging the X label previews without saving and saves once on release', async ({ page, projects }) => {
  await projects.write('m1-label-drag', { documents: { banner } })
  await page.goto(projects.appUrl('m1-label-drag', 'banner'))
  await expect(page.locator('.save')).toHaveText('Saved')
  await page.locator('.layer-list [data-layer-id="rect-1"]').click()

  const inspector = page.getByRole('complementary', { name: 'Inspector' })
  const x = inspector.getByRole('textbox', { name: 'X' })
  await expect(x).toHaveValue('40')
  const label = (await inspector.locator('label', { hasText: /^X$/ }).boundingBox())!
  const from = { x: label.x + label.width / 2, y: label.y + label.height / 2 }

  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + 30, from.y, { steps: 6 })
  await expect(x).toHaveValue('70')
  // Longer than the autosave delay: nothing is saved while the gesture runs.
  await page.waitForTimeout(800)
  expect((await projects.read('m1-label-drag', 'banner')).layers[0]).toMatchObject({ x: 40 })

  await page.mouse.up()
  await expect.poll(async () => ((await projects.read('m1-label-drag', 'banner')).layers[0] as LeafLayer).x).toBe(70)
  await expect(page.locator('.save')).toHaveText('Saved')
  await expect(x).not.toBeFocused()
})
