// M1 #9: a locked or hidden Layer picked in the Layer list shows in the Inspector and
// can be unlocked or shown from there; on the Canvas it does not move.
import type { Document } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

const banner: Document = {
  version: 1,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [
    { id: 'rect-1', type: 'rect', x: 20, y: 20, width: 100, height: 60, fill: '#ff0000', locked: true },
    { id: 'rect-2', type: 'rect', x: 250, y: 100, width: 100, height: 60, fill: '#0000ff', visible: false },
  ],
}

test('a locked Layer picked in the list stays put on the Canvas until unlocked in the Inspector', async ({ page, projects }) => {
  await projects.write('m1-locked', { documents: { banner } })
  await page.goto(projects.appUrl('m1-locked', 'banner'))
  await expect(page.locator('.save')).toHaveText('Saved')
  const read = () => projects.read('m1-locked', 'banner')
  const inspector = page.getByRole('complementary', { name: 'Inspector' })

  await page.locator('.layer-list li[data-layer-id="rect-1"]').click()
  await expect(page.locator('.layer-list li[aria-selected="true"]')).toHaveText(['rect-1'])
  await expect(inspector.getByRole('textbox', { name: 'X' })).toHaveValue('20')

  const box = (await page.locator('canvas.upper-canvas').boundingBox())!
  const zoom = box.width / banner.canvas.width
  const at = (x: number, y: number) => [box.x + x * zoom, box.y + y * zoom] as const
  await page.mouse.move(...at(70, 50))
  await page.mouse.down()
  await page.mouse.move(...at(100, 80), { steps: 4 })
  await page.mouse.up()
  await page.locator('.layer-list li[data-layer-id="rect-1"]').click()
  await page.keyboard.press('ArrowRight')
  expect((await read()).layers[0]).toEqual(banner.layers[0])

  await inspector.getByRole('checkbox', { name: 'Locked' }).uncheck()
  await expect(page.locator('.layer-list li[aria-selected="true"]')).toHaveText(['rect-1'])
  await expect.poll(async () => (await read()).layers[0]!.locked).toBeUndefined()

  // Only this nudge moves it: the drag and the nudge above while locked did nothing.
  await page.locator('.layer-list li[data-layer-id="rect-1"]').click()
  await page.keyboard.press('ArrowRight')
  await expect.poll(async () => (await read()).layers[0]).toEqual({ ...banner.layers[0], locked: undefined, x: 21 })
})

test('a hidden Layer picked in the list can be shown from the Inspector and stays selected', async ({ page, projects }) => {
  await projects.write('m1-hidden', { documents: { banner } })
  await page.goto(projects.appUrl('m1-hidden', 'banner'))
  await expect(page.locator('.save')).toHaveText('Saved')
  const read = () => projects.read('m1-hidden', 'banner')
  const inspector = page.getByRole('complementary', { name: 'Inspector' })

  await page.locator('.layer-list li[data-layer-id="rect-2"]').click()
  await inspector.getByRole('checkbox', { name: 'Visible' }).check()

  await expect.poll(async () => (await read()).layers[1]!.visible).toBeUndefined()
  await expect(page.locator('.layer-list li[aria-selected="true"]')).toHaveText(['rect-2'])
})
