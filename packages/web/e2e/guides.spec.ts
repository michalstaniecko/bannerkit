// M3 #37: Guides in real Chromium. Guides and snap lines are drawn on Fabric's top
// context only (ADR 0008), so an Export is pixel for pixel the same with them as
// without; and a Guide dragged out of a Ruler in the real page layout is saved.
import type { Document } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

test.use({ deviceScaleFactor: 2 })

const banner: Document = {
  version: 2,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [
    { id: 'a', type: 'rect', x: 40, y: 40, width: 100, height: 60, fill: '#ff0000' },
    { id: 'b', type: 'rect', x: 220, y: 100, width: 80, height: 60, fill: '#0000ff' },
  ],
}

declare global {
  interface Window {
    guidesTest: { editor: ReturnType<Window['bannerkit']['createEditor']> }
  }
}

test('an Export with Guides, and one in the middle of a drag showing snap lines, equal the Export without them', async ({ harness }) => {
  const exportPixels = () =>
    harness.evaluate(async () => {
      const { blob } = await window.guidesTest.editor.export({ format: 'png', scale: 1 })
      const bitmap = await createImageBitmap(blob)
      const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext('2d')!
      ctx.drawImage(bitmap, 0, 0)
      return [...ctx.getImageData(0, 0, bitmap.width, bitmap.height).data].join(',')
    })
  const open = (document: Document) =>
    harness.evaluate(async (document) => {
      const { createEditor, host } = window.bannerkit
      await window.guidesTest?.editor.destroy()
      host().replaceChildren()
      const editor = createEditor()
      editor.mount(host())
      await editor.load(document)
      editor.setZoom(1)
      window.guidesTest = { editor }
    }, document)
  /** How many pixels of the top canvas are painted (Guides, snap lines). */
  const painted = () =>
    harness.evaluate(() => {
      const upper = document.querySelector<HTMLCanvasElement>('canvas.upper-canvas')!
      const data = upper.getContext('2d')!.getImageData(0, 0, upper.width, upper.height).data
      let count = 0
      for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) count++
      return count
    })

  await open(banner)
  const plain = await exportPixels()
  expect(await painted()).toBe(0)

  await open({ ...banner, guides: { x: [180, -20], y: [120] } })
  await expect.poll(painted).toBeGreaterThan(0)
  expect(await exportPixels()).toBe(plain)

  // Drag b so its left edge comes 3 px from a's right edge (140), and its centre 3 px
  // from the Guide x = 180: it snaps to x = 140 with snap lines showing.
  const canvas = (await harness.locator('canvas.upper-canvas').boundingBox())!
  await harness.mouse.move(canvas.x + 260, canvas.y + 130)
  await harness.mouse.down()
  await harness.mouse.move(canvas.x + 200, canvas.y + 130, { steps: 4 })
  await harness.mouse.move(canvas.x + 183, canvas.y + 130, { steps: 2 })
  await expect.poll(() => harness.evaluate(() => window.guidesTest.editor.marks().length)).toBeGreaterThan(0)
  const midDrag = await exportPixels()
  await harness.mouse.up()
  expect(await harness.evaluate(() => window.guidesTest.editor.getDocument().layers[1])).toMatchObject({ x: 140, y: 100 })
  const released = await exportPixels()

  // The same layout without Guides or a gesture.
  await open({ ...banner, layers: [banner.layers[0]!, { ...banner.layers[1]!, x: 140 } as Document['layers'][number]] })
  const moved = await exportPixels()
  expect(moved).not.toBe(plain)
  expect(midDrag).toBe(moved)
  expect(released).toBe(moved)
})

test('a Guide dragged out of the top Ruler in the page is saved as a horizontal Guide', async ({ page, projects }) => {
  await projects.write('m3-guides', { documents: { banner } })
  await page.goto(projects.appUrl('m3-guides', 'banner'))
  await expect(page.locator('.save')).toHaveText('Saved')
  await page.getByRole('button', { name: '100%', exact: true }).click()
  await expect(page.locator('.zoom')).toHaveText('100%')

  const ruler = (await page.locator('.ruler-top canvas').boundingBox())!
  const canvas = (await page.locator('canvas.upper-canvas').boundingBox())!
  await page.mouse.move(canvas.x + 300, ruler.y + ruler.height / 2)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 300, canvas.y + 30, { steps: 4 })
  await page.mouse.move(canvas.x + 300, canvas.y + 77, { steps: 4 })
  await expect.poll(async () => page.locator('.ruler-left canvas').getAttribute('data-guide-value')).toMatch(/^77@/)
  await page.mouse.up()

  await expect.poll(async () => (await projects.read('m3-guides', 'banner')).guides).toEqual({ x: [], y: [77] })

  // Back onto the left Ruler: removed, and the key with it.
  const left = (await page.locator('.ruler-left canvas').boundingBox())!
  await page.mouse.move(canvas.x + 200, canvas.y + 77)
  await page.mouse.down()
  await page.mouse.move(left.x + left.width / 2, canvas.y + 90, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => projects.read('m3-guides', 'banner')).not.toHaveProperty('guides')
})
