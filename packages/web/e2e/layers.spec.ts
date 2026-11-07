// S3: the Layer list and the toolbar in the editor app, autosaved to disk.
import type { Document, Layer } from '@bannerkit/core'
import type { Page } from '@playwright/test'
import { expect, test } from './fixtures.ts'

const banner: Document = {
  version: 2,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [
    { id: 'rect-1', type: 'rect', x: 20, y: 20, width: 100, height: 60, fill: '#ff0000' },
    { id: 'rect-2', type: 'rect', x: 250, y: 100, width: 100, height: 60, fill: '#0000ff' },
    {
      id: 'text-1',
      type: 'text',
      x: 150,
      y: 20,
      width: 200,
      text: 'Sale',
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: 24,
      fill: '#000000',
    },
  ],
}

/** A 2×1 PNG. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAD0lEQVQImWP4z8Dwn4EBAAj+Af/KOtJRAAAAAElFTkSuQmCC', 'base64')

async function open(page: Page, url: string) {
  await page.goto(url)
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect(page.locator('.save')).toHaveText('Saved')
}

const rows = (page: Page) => page.locator('.layer-list li')
const row = (page: Page, id: string) => page.locator(`.layer-list li[data-layer-id="${id}"]`)
/** Drags the row of `from` onto the top, middle or bottom of the row of `to`. */
async function drop(page: Page, from: string, to: string, part: 'top' | 'middle' | 'bottom') {
  const target = row(page, to).locator('> .layer-row')
  const { width, height } = (await target.boundingBox())!
  const y = { top: 0.1, middle: 0.5, bottom: 0.9 }[part] * height
  await row(page, from).locator('> .layer-row .layer-name').dragTo(target, { targetPosition: { x: width / 2, y } })
}
/** The shown rows top → bottom, indented two spaces per depth. */
const tree = (page: Page) =>
  page
    .locator('.layer-list li')
    .evaluateAll((lis) => lis.map((li) => '  '.repeat(Number((li as HTMLElement).dataset.depth)) + (li as HTMLElement).dataset.layerId))
/** The Document's Layer tree, bottom → top: ids, a Group as `{ id: [...] }`. */
const shape = (layers: readonly Layer[]): unknown[] =>
  layers.map((l) => (l.type === 'group' ? { [l.id]: shape(l.layers) } : l.id))
const idsOnDisk = async (read: () => Promise<Document>) => (await read()).layers.map((l) => l.id)

test('the Layer list shows Layers top → bottom; dragging reorders and is autosaved', async ({ page, projects }) => {
  await projects.write('s3-list', { documents: { banner } })
  await open(page, projects.appUrl('s3-list', 'banner'))
  const read = () => projects.read('s3-list', 'banner')

  await expect(rows(page)).toHaveText(['text-1', 'rect-2', 'rect-1'])

  await drop(page, 'rect-1', 'text-1', 'top')

  await expect(rows(page)).toHaveText(['rect-1', 'text-1', 'rect-2'])
  await expect.poll(() => idsOnDisk(read)).toEqual(['rect-2', 'text-1', 'rect-1'])

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rows(page)).toHaveText(['text-1', 'rect-2', 'rect-1'])
})

test('visibility and lock toggles update the Document; a locked Layer is not selectable', async ({ page, projects }) => {
  await projects.write('s3-flags', { documents: { banner } })
  await open(page, projects.appUrl('s3-flags', 'banner'))
  const read = () => projects.read('s3-flags', 'banner')

  await page.getByLabel('Show rect-2').uncheck()
  await page.getByLabel('Lock rect-1').check()

  await expect.poll(async () => (await read()).layers.map((l) => [l.id, l.visible, l.locked])).toEqual([
    ['rect-1', undefined, true],
    ['rect-2', false, undefined],
    ['text-1', undefined, undefined],
  ])

  const box = (await page.locator('canvas.upper-canvas').boundingBox())!
  const zoom = box.width / banner.canvas.width
  await page.mouse.click(box.x + 70 * zoom, box.y + 50 * zoom)
  await expect(page.locator('.layer-list li[aria-selected="true"]')).toHaveCount(0)

  // Each toggle was one undo step.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByLabel('Lock rect-1')).not.toBeChecked()
  await expect(page.getByLabel('Show rect-2')).not.toBeChecked()
})

test('the toolbar adds text and rect Layers, and deletes and duplicates a multi-selection', async ({ page, projects }) => {
  await projects.write('s3-toolbar', { documents: { banner } })
  await open(page, projects.appUrl('s3-toolbar', 'banner'))
  const read = () => projects.read('s3-toolbar', 'banner')

  await page.getByRole('button', { name: 'Add text' }).click()
  await page.getByRole('button', { name: 'Add rect' }).click()
  await expect(rows(page)).toHaveText(['rect-3', 'text-2', 'text-1', 'rect-2', 'rect-1'])
  await expect(row(page, 'rect-3')).toHaveAttribute('aria-selected', 'true')

  await row(page, 'rect-1').getByRole('button').click()
  await row(page, 'rect-2').getByRole('button').click({ modifiers: ['Shift'] })
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click()
  await expect(rows(page)).toHaveText(['rect-3', 'text-2', 'text-1', 'rect-5', 'rect-2', 'rect-4', 'rect-1'])
  await expect(page.locator('.layer-list li[aria-selected="true"]')).toHaveText(['rect-5', 'rect-4'])

  await page.getByRole('button', { name: 'Delete' }).click()
  await expect(rows(page)).toHaveText(['rect-3', 'text-2', 'text-1', 'rect-2', 'rect-1'])
  await expect.poll(() => idsOnDisk(read)).toEqual(['rect-1', 'rect-2', 'text-1', 'text-2', 'rect-3'])

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(rows(page)).toHaveCount(7)
})

test('Ctrl/Cmd+G groups the Selection and Ctrl/Cmd+Shift+G ungroups it, autosaved', async ({ page, projects }) => {
  await projects.write('s3-group', { documents: { banner } })
  await open(page, projects.appUrl('s3-group', 'banner'))
  const read = () => projects.read('s3-group', 'banner')
  const tree = async () => (await read()).layers.map((l) => (l.type === 'group' ? { [l.id]: l.layers.map((c) => c.id) } : l.id))

  await row(page, 'rect-1').getByRole('button').click()
  await row(page, 'rect-2').getByRole('button').click({ modifiers: ['Shift'] })
  await page.keyboard.press('ControlOrMeta+g')
  await expect.poll(tree).toEqual([{ 'group-1': ['rect-1', 'rect-2'] }, 'text-1'])
  await expect(page.getByRole('button', { name: 'Ungroup' })).toBeEnabled()

  await page.keyboard.press('ControlOrMeta+Shift+g')
  await expect.poll(tree).toEqual(['rect-1', 'rect-2', 'text-1'])
  await expect(page.getByRole('button', { name: 'Ungroup' })).toBeDisabled()
})

test('adding an image adds the picked file as an Asset', async ({ page, projects }) => {
  await projects.write('s3-image', { documents: { banner } })
  await open(page, projects.appUrl('s3-image', 'banner'))

  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Add image' }).click()
  await (await chooser).setFiles({ name: 'Hero Shot.png', mimeType: 'image/png', buffer: PNG })

  await expect(rows(page).first()).toHaveText('image-1')
  await expect.poll(async () => (await projects.read('s3-image', 'banner')).layers.at(-1)).toMatchObject({
    id: 'image-1',
    type: 'image',
    src: 'assets/hero-shot.png',
    fit: 'contain',
  })
  await expect(page.locator('.error')).toHaveCount(0)
})

test('the top bar creates a Document from a Preset and duplicates one to another size', async ({ page, projects }) => {
  await projects.write('s3-docs', { documents: { banner } })
  await open(page, projects.appUrl('s3-docs', 'banner'))

  await page.getByLabel('Size').selectOption('728x90')
  await page.getByRole('button', { name: 'Duplicate to size' }).click()
  await expect(page).toHaveURL(/doc=banner-728x90/)
  await expect(rows(page)).toHaveText(['text-1', 'rect-2', 'rect-1'])
  expect((await projects.read('s3-docs', 'banner-728x90')).canvas).toMatchObject({ width: 728, height: 90 })

  await page.getByLabel('Size').selectOption('300x250')
  await page.getByLabel('New Document name').fill('mrec')
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await expect(page).toHaveURL(/doc=mrec/)
  await expect(page.locator('canvas.upper-canvas')).toBeVisible()
  await expect(rows(page)).toHaveCount(0)
  expect((await projects.read('s3-docs', 'mrec')).canvas).toMatchObject({ width: 300, height: 250 })
  await expect(page.getByRole('combobox', { name: /^Document/ })).toHaveValue('mrec')
})

const grouped: Document = {
  ...banner,
  name: 'grouped',
  layers: [
    banner.layers[0]!,
    {
      id: 'group-1',
      type: 'group',
      name: 'Badge',
      layers: [banner.layers[1]!, { id: 'group-2', type: 'group', layers: [banner.layers[2]!] }],
    },
  ],
}

test('dragging rows moves Layers into a Group, out of it and between levels; each drop is one undo step', async ({ page, projects }) => {
  await projects.write('s3-tree', { documents: { grouped } })
  await open(page, projects.appUrl('s3-tree', 'grouped'))
  const read = async () => shape((await projects.read('s3-tree', 'grouped')).layers)

  await expect.poll(() => tree(page)).toEqual(['group-1', '  group-2', '    text-1', '  rect-2', 'rect-1'])

  // the middle of a Group row: on top of its Layers
  await drop(page, 'rect-1', 'group-2', 'middle')
  await expect.poll(() => tree(page)).toEqual(['group-1', '  group-2', '    rect-1', '    text-1', '  rect-2'])
  await expect.poll(read).toEqual([{ 'group-1': ['rect-2', { 'group-2': ['text-1', 'rect-1'] }] }])

  // out of a Group, below a row one level up
  await drop(page, 'text-1', 'rect-2', 'bottom')
  await expect.poll(() => tree(page)).toEqual(['group-1', '  group-2', '    rect-1', '  rect-2', '  text-1'])

  // out to the root, above the top Group
  await drop(page, 'rect-2', 'group-1', 'top')
  await expect.poll(() => tree(page)).toEqual(['rect-2', 'group-1', '  group-2', '    rect-1', '  text-1'])
  await expect.poll(read).toEqual([{ 'group-1': ['text-1', { 'group-2': ['rect-1'] }] }, 'rect-2'])

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => tree(page)).toEqual(['group-1', '  group-2', '    rect-1', '  rect-2', '  text-1'])
  await page.getByRole('button', { name: 'Undo' }).click()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => tree(page)).toEqual(['group-1', '  group-2', '    text-1', '  rect-2', 'rect-1'])
})

test('a Group cannot be dropped into its descendant; moving out its last Layer removes it', async ({ page, projects }) => {
  await projects.write('s3-tree-rules', { documents: { grouped } })
  await open(page, projects.appUrl('s3-tree-rules', 'grouped'))
  const read = async () => shape((await projects.read('s3-tree-rules', 'grouped')).layers)
  const initial = ['group-1', '  group-2', '    text-1', '  rect-2', 'rect-1']

  await drop(page, 'group-1', 'group-2', 'middle')
  await drop(page, 'group-1', 'text-1', 'top')
  await expect.poll(() => tree(page)).toEqual(initial)
  await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled()

  await drop(page, 'text-1', 'rect-1', 'bottom')
  await expect.poll(() => tree(page)).toEqual(['group-1', '  rect-2', 'rect-1', 'text-1'])
  await expect.poll(read).toEqual(['text-1', 'rect-1', { 'group-1': ['rect-2'] }])

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect.poll(() => tree(page)).toEqual(initial)
})
