// S3: live reload. The server streams Document changes on disk to the editor (SSE);
// a clean editor reloads silently, one with unsaved edits asks "reload / keep mine".
import type { Document } from '@bannerkit/core'
import type { Page } from '@playwright/test'
import { expect, test, type Projects } from './fixtures.ts'

const banner = (fill: string, x = 0): Document => ({
  version: 2,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [{ id: 'rect-1', type: 'rect', x, y: 0, width: 200, height: 200, fill }],
})

const RED = [255, 0, 0]
const BLUE = [0, 0, 255]

async function open(page: Page, url: string) {
  await page.goto(url)
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect(page.locator('.save')).toHaveText('Saved')
  const canvas = page.locator('canvas.lower-canvas')
  /** RGB at a fraction of the Canvas, whatever the zoom. */
  return (fx: number, fy: number) =>
    canvas.evaluate(
      (el: HTMLCanvasElement, [x, y]) => [...el.getContext('2d')!.getImageData(el.width * x!, el.height * y!, 1, 1).data].slice(0, 3),
      [fx, fy],
    )
}

test('editing a Document file on disk reloads the editor, as one undo step', async ({ page, projects }) => {
  await projects.write('s3-live', { documents: { banner: banner('#ff0000') } })
  const pixel = await open(page, projects.appUrl('s3-live', 'banner'))
  await expect.poll(() => pixel(0.25, 0.5)).toEqual(RED)

  await projects.write('s3-live', { documents: { banner: banner('#0000ff') } })

  await expect.poll(() => pixel(0.25, 0.5)).toEqual(BLUE)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.save')).toHaveText('Saved')
  // The reload is one step: undo brings back the red, and autosaves it.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => pixel(0.25, 0.5)).toEqual(RED)
  await expect.poll(async () => (await projects.read('s3-live', 'banner')).layers[0]).toMatchObject({ fill: '#ff0000' })
})

/** Opens the Document, makes an edit that cannot be saved yet, then changes the file on disk. */
async function conflict(page: Page, projects: Projects, project: string) {
  await projects.write(project, { documents: { banner: banner('#ff0000') } })
  const pixel = await open(page, projects.appUrl(project, 'banner'))
  await expect.poll(() => pixel(0.25, 0.5)).toEqual(RED)
  // Saves fail for now, so the edit stays unsaved.
  await page.route('**/api/projects/*/documents/*', (route) => (route.request().method() === 'PUT' ? route.abort() : route.fallback()))
  const box = (await page.locator('canvas.upper-canvas').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height * 0.5)
  await page.keyboard.press('Shift+ArrowRight')
  await expect(page.locator('.save')).toHaveText('Not saved')

  await projects.write(project, { documents: { banner: banner('#0000ff') } })
  await expect(page.getByRole('alert')).toContainText('File changed on disk')
  await page.unroute('**/api/projects/*/documents/*')
  return pixel
}

test('a change on disk while edits are unsaved asks; "Reload" shows the file on disk', async ({ page, projects }) => {
  const pixel = await conflict(page, projects, 's3-live-reload')
  await expect.poll(() => pixel(0.25, 0.5)).toEqual(RED)

  await page.getByRole('button', { name: 'Reload' }).click()

  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(() => pixel(0.25, 0.5)).toEqual(BLUE)
  expect(await projects.read('s3-live-reload', 'banner')).toEqual(banner('#0000ff'))
})

test('"Keep mine" keeps the edits and saves them over the file on disk', async ({ page, projects }) => {
  const pixel = await conflict(page, projects, 's3-live-keep')

  await page.getByRole('button', { name: 'Keep mine' }).click()

  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect.poll(async () => (await projects.read('s3-live-keep', 'banner')).layers[0]).toMatchObject({ fill: '#ff0000', x: 10 })
  await expect(page.locator('.save')).toHaveText('Saved')
  expect(await pixel(0.25, 0.5)).toEqual(RED)
})

test('while the banner is up, switching Project or Document waits for the choice', async ({ page, projects }) => {
  await conflict(page, projects, 's3-live-switch')
  const projectPicker = page.getByRole('combobox', { name: /^Project/ })
  const documentPicker = page.getByRole('combobox', { name: /^Document/ })

  await expect(projectPicker).toBeDisabled()
  await expect(documentPicker).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Duplicate to size' })).toBeDisabled()
  // Nothing was written over the change on disk meanwhile.
  expect(await projects.read('s3-live-switch', 'banner')).toEqual(banner('#0000ff'))

  await page.getByRole('button', { name: 'Reload' }).click()

  await expect(projectPicker).toBeEnabled()
  await expect(documentPicker).toBeEnabled()
})
