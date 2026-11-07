// M1 #13: typography typed in the Inspector changes the Canvas at once and, once
// autosaved, the server Render of the Document.
import type { Document } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

const banner: Document = {
  version: 1,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [
    { id: 'text-1', type: 'text', x: 20, y: 60, width: 360, text: 'Summer sale', fontFamily: 'Inter', fontWeight: 700, fontSize: 40, fill: '#000000' },
  ],
}

test('editing letter spacing in the Inspector changes the Canvas and the Render', async ({ page, projects, request }) => {
  await projects.write('m1-letter-spacing', { documents: { banner } })
  const render = async () => {
    const response = await request.post('/api/projects/m1-letter-spacing/documents/banner/render', { data: { format: 'png', scale: 1 } })
    expect(response.status()).toBe(200)
    return Buffer.from(await response.body())
  }
  const before = await render()

  await page.goto(projects.appUrl('m1-letter-spacing', 'banner'))
  await expect(page.locator('.save')).toHaveText('Saved')
  const canvas = page.locator('canvas.lower-canvas')
  const shownBefore = await canvas.screenshot()
  await page.locator('.layer-list [data-layer-id="text-1"]').click()

  const spacing = page.getByRole('complementary', { name: 'Inspector' }).getByRole('textbox', { name: 'Letter spacing' })
  await expect(spacing).toHaveValue('0')
  await spacing.fill('6')
  await spacing.press('Enter')

  await expect.poll(async () => (await projects.read('m1-letter-spacing', 'banner')).layers[0]).toMatchObject({ letterSpacing: 6 })
  await expect(page.locator('.save')).toHaveText('Saved')
  expect((await canvas.screenshot()).equals(shownBefore)).toBe(false)
  expect((await render()).equals(before)).toBe(false)
})
