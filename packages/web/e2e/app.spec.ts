// S3: the editor app opens a Document with image and text Layers from a Project.
import type { Document } from '@bannerkit/core'
import { expect, test } from './fixtures.ts'

// For the editor, the server reports a missing Asset file as a warning, so the
// Document opens with a placeholder (an Asset that fails to load is an S2 test).
const RED_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="#ff0000"/></svg>'

const banner: Document = {
  version: 2,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [
    { id: 'image-1', type: 'image', x: 0, y: 0, width: 200, height: 200, src: 'assets/red.svg', fit: 'cover' },
    { id: 'image-2', type: 'image', x: 200, y: 0, width: 200, height: 200, src: 'assets/gone.png', fit: 'cover' },
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

test('shows Assets with their Fit, a hatched placeholder for a missing one, and text', async ({ page, projects }) => {
  await projects.write('s3-app', { documents: { banner }, assets: { 'red.svg': RED_SVG } })

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

type Checked = { id: string; image: boolean } | { id: string; lines: string[]; core: string[] }

for (const name of ['hero', 'rectangle', 'square']) {
  test(`the demo ${name} banner shows every Asset and breaks text like core`, async ({ harness }) => {
    const result = await harness.evaluate(async (name) => {
      const { createEditor, core, fonts, host } = window.bannerkit
      const { document } = (await (await fetch(`/api/projects/demo/documents/${name}`)).json()) as { document: Document }
      const editor = createEditor()
      editor.mount(host())
      await editor.load(document, { assetUrl: (src) => `/api/projects/demo/${src}` })
      return document.layers.flatMap((layer): Checked[] => {
        const object = editor.objectFor(layer.id)!
        if (layer.type === 'image') return [{ id: layer.id, image: object.isType('image') }]
        if (layer.type !== 'text') return []
        const layout = core.layoutText(layer, fonts.measureText)
        return [{ id: layer.id, lines: (object as unknown as { textLines: string[] }).textLines, core: layout.lines.map((l) => l.text) }]
      })
    }, name)

    expect(result.some((r) => 'image' in r)).toBe(true)
    expect(result.some((r) => 'lines' in r)).toBe(true)
    for (const r of result) {
      if ('image' in r) expect(r.image, r.id).toBe(true)
      else expect(r.lines, r.id).toEqual(r.core)
    }
  })
}
