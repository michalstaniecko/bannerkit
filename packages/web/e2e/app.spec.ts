// S3: the editor app opens a Document with image and text Layers from a Project.
import type { Document } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

// The server validates that `src` exists, so a Document it serves can only reach the
// editor with an Asset that exists but fails to load: a broken file, or one deleted since.
const RED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#ff0000"/></svg>'

const banner: Document = {
  version: 1,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [
    { id: 'image-1', type: 'image', x: 0, y: 0, width: 200, height: 200, src: 'assets/red.svg', fit: 'cover' },
    { id: 'image-2', type: 'image', x: 200, y: 0, width: 200, height: 200, src: 'assets/broken.png', fit: 'cover' },
    {
      id: 'text-1',
      type: 'text',
      x: 20,
      y: 150,
      width: 360,
      text: 'Summer sale',
      fontFamily: 'Inter',
      fontWeight: 800,
      fontSize: 32,
      fill: '#000000',
    },
  ],
}

test('shows Assets with their Fit, a hatched placeholder for one that fails to load, and text', async ({ page, projects }) => {
  await projects.write('s3-app', { documents: { banner }, assets: { 'red.svg': RED_SVG, 'broken.png': 'not a png' } })

  await page.goto(projects.appUrl('s3-app', 'banner'))

  const canvas = page.locator('canvas.lower-canvas')
  await expect(canvas).toBeVisible()
  await expect(page.locator('.error')).toHaveCount(0)
  /** RGB at a fraction of the Canvas, whatever the zoom. */
  const at = (fx: number, fy: number) =>
    canvas.evaluate(
      (el: HTMLCanvasElement, [x, y]) => [...el.getContext('2d')!.getImageData(el.width * x!, el.height * y!, 1, 1).data].slice(0, 3),
      [fx, fy],
    )
  await expect.poll(() => at(0.25, 0.25)).toEqual([255, 0, 0])
  const hatch = await Promise.all([0.6, 0.62, 0.64, 0.66, 0.68, 0.7].map((fx) => at(fx, 0.25)))
  expect(new Set(hatch.map(String)).size).toBeGreaterThan(1)
  expect(await page.evaluate(() => document.fonts.check('800 32px "Inter"'))).toBe(true)
})
