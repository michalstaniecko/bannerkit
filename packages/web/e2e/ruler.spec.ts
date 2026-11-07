// M3 #34: the Rulers above and left of the Canvas, in the real page layout. Each
// Ruler <canvas> lists the labels it drew in `data-labels` ("value@px", px along the
// Ruler in CSS px); the tests check those against the Canvas on screen and against
// the Ruler's own pixels, at several zooms and after scrolling the viewport.
import type { Document } from '@bannerkit/core'
import type { Locator, Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

const banner: Document = {
  version: 2,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x: 40, y: 40, width: 100, height: 60, fill: '#ff0000' }],
}

type Label = { value: number; at: number }

async function labels(ruler: Locator): Promise<Label[]> {
  const attr = (await ruler.getAttribute('data-labels')) ?? ''
  return attr
    .split(' ')
    .filter(Boolean)
    .map((pair) => {
      const [value, at] = pair.split('@').map(Number)
      return { value: value!, at: at! }
    })
}

/** The Ruler's pixel (RGBA) at CSS px `at` along it, `across` CSS px from its outer edge. */
const pixel = (ruler: Locator, at: number, across: number) =>
  ruler.evaluate(
    (canvas: HTMLCanvasElement, [at, across]) => {
      const dpr = canvas.width / canvas.clientWidth
      const horizontal = canvas.clientWidth > canvas.clientHeight
      const [x, y] = horizontal ? [at, across] : [across, at]
      return [...canvas.getContext('2d')!.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data]
    },
    [at, across] as const,
  )

/** Within a screen px: ticks sit on whole device px. */
const expectNear = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)

const top = (page: Page) => page.locator('.ruler-top canvas')
const left = (page: Page) => page.locator('.ruler-left canvas')

/**
 * Both Rulers agree with the Canvas on screen: label 0 on the Canvas edge, every label
 * `value × zoom` px from it, and a tick drawn under label 0.
 */
async function expectRulersMatchCanvas(page: Page) {
  // Retried: a Ruler draws on the next animation frame after a zoom or a scroll.
  await expect(async () => {
    const canvas = (await page.locator('canvas.lower-canvas').boundingBox())!
    const zoom = canvas.width / banner.canvas.width
    for (const [ruler, axis, edge] of [
      [top(page), 'x', canvas.x],
      [left(page), 'y', canvas.y],
    ] as const) {
      const start = (await ruler.boundingBox())![axis]
      const drawn = await labels(ruler)
      expect(drawn.length).toBeGreaterThan(2)
      const zero = drawn.find((l) => l.value === 0)
      expect(zero, 'label 0').toBeDefined()
      expectNear(start + zero!.at, edge)
      for (const l of drawn) expectNear(start + l.at, edge + l.value * zoom)
      // A full-length tick under label 0, unlike the background beside it near the inner edge.
      expect((await pixel(ruler, zero!.at, 10)).slice(0, 3)).not.toEqual((await pixel(ruler, zero!.at + 2, 18)).slice(0, 3))
    }
  }).toPass({ timeout: 5000 })
}

test('the Rulers match the Canvas at several zooms and after scrolling', async ({ page, projects }) => {
  await projects.write('m3-ruler', { documents: { banner } })
  await page.goto(projects.appUrl('m3-ruler', 'banner'))
  await expect(page.locator('.save')).toHaveText('Saved')

  // Fit, then 100%, then zoomed in far enough to scroll.
  await expectRulersMatchCanvas(page)
  await page.getByRole('button', { name: '100%', exact: true }).click()
  await expect(page.locator('.zoom')).toHaveText('100%')
  await expectRulersMatchCanvas(page)
  const at100 = (await labels(top(page))).map((l) => l.value)
  expect(at100.filter((v) => v > 0).slice(0, 3)).toEqual([50, 100, 150])
  // The whole viewport is labelled: beyond the Canvas on both sides, negative before it.
  expect(Math.min(...(await labels(top(page))).filter((l) => l.at > 0).map((l) => l.value))).toBeLessThan(0)
  expect(Math.max(...at100)).toBeGreaterThan(banner.canvas.width)

  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(page.locator('.zoom')).toHaveText('244%')
  await expectRulersMatchCanvas(page)

  // Scrolled: the labels move with the Canvas; label 0 is scrolled out of view.
  await page.locator('.viewport').evaluate((viewport) => viewport.scrollTo(300, 100))
  await expect.poll(async () => (await labels(top(page))).some((l) => l.value === 0 && l.at > 0)).toBe(false)
  const canvas = (await page.locator('canvas.lower-canvas').boundingBox())!
  const zoom = canvas.width / banner.canvas.width
  const rulerX = (await top(page).boundingBox())!.x
  const drawn = await labels(top(page))
  expect(drawn.length).toBeGreaterThan(2)
  for (const l of drawn) expectNear(rulerX + l.at, canvas.x + l.value * zoom)
})

test('the Rulers highlight the Selection Box, live while it is dragged', async ({ page, projects }) => {
  await projects.write('m3-ruler-selection', { documents: { banner } })
  await page.goto(projects.appUrl('m3-ruler-selection', 'banner'))
  await expect(page.locator('.save')).toHaveText('Saved')
  await page.getByRole('button', { name: '100%', exact: true }).click()
  await expect(page.locator('.zoom')).toHaveText('100%')

  const ruler = top(page)
  const zeroAt = async () => (await labels(ruler)).find((l) => l.value === 0)!.at
  // Just before the tick of label 50, at the top: no tick, no text, only the background or the highlight.
  const at50 = async () => (await zeroAt()) + 48
  const plain = await pixel(ruler, await at50(), 1)

  const canvas = (await page.locator('canvas.upper-canvas').boundingBox())!
  await page.mouse.click(canvas.x + 90, canvas.y + 70) // rect-1: x 40..140
  await expect.poll(async () => pixel(ruler, await at50(), 1)).not.toEqual(plain)

  // Dragged 100 px right: x 140..240, so 48 is outside it again, while the mouse is still down.
  await page.mouse.move(canvas.x + 90, canvas.y + 70)
  await page.mouse.down()
  await page.mouse.move(canvas.x + 190, canvas.y + 70, { steps: 5 })
  await expect.poll(async () => pixel(ruler, await at50(), 1)).toEqual(plain)
  await expect.poll(async () => pixel(ruler, (await zeroAt()) + 198, 1)).not.toEqual(plain)
  await page.mouse.up()
})

test('without an open Document the Ruler gutters are there and empty', async ({ page }) => {
  await page.goto('/')
  for (const ruler of [top(page), left(page)]) {
    await expect(ruler).toHaveCount(1)
    const box = (await ruler.boundingBox())!
    expect(Math.min(box.width, box.height)).toBe(20)
    expect(await labels(ruler)).toEqual([])
    // Every pixel is the background: no ticks, no labels.
    const colours = await ruler.evaluate((canvas: HTMLCanvasElement) => {
      const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
      const seen = new Set<string>()
      for (let i = 0; i < data.length; i += 4) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`)
      return seen.size
    })
    expect(colours).toBeLessThanOrEqual(1)
  }
})

test.describe('on a devicePixelRatio 2 screen', () => {
  test.use({ deviceScaleFactor: 2 })

  test('the Ruler buffers are drawn at 2× their CSS size', async ({ page, projects }) => {
    await projects.write('m3-ruler-dpr', { documents: { banner } })
    await page.goto(projects.appUrl('m3-ruler-dpr', 'banner'))
    await expect(page.locator('.save')).toHaveText('Saved')
    for (const ruler of [top(page), left(page)]) {
      await expect.poll(async () => (await labels(ruler)).length).toBeGreaterThan(2)
      const size = await ruler.evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height, cssWidth: c.clientWidth, cssHeight: c.clientHeight }))
      expect(size.width).toBe(Math.round(size.cssWidth * 2))
      expect(size.height).toBe(Math.round(size.cssHeight * 2))
    }
    await expectRulersMatchCanvas(page)
  })
})
