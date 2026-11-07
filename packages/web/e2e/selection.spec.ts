// S3: the human's Selection in the editor reaches `.state.json`, where an agent's
// `bannerkit inspect` reads it.
import type { Document } from '@bannerkit/core'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, test } from './fixtures.ts'
import { repoRoot } from './root.ts'

const banner: Document = {
  version: 2,
  name: 'banner',
  canvas: { width: 400, height: 200, background: '#ffffff' },
  layers: [
    { id: 'rect-1', type: 'rect', x: 40, y: 40, width: 100, height: 60, fill: '#ff0000' },
    { id: 'rect-2', type: 'rect', x: 240, y: 100, width: 100, height: 60, fill: '#0000ff' },
  ],
}

const readState = async (root: string, project: string) => {
  try {
    return JSON.parse(await readFile(join(root, project, '.state.json'), 'utf8'))
  } catch {
    return null
  }
}

const bannerkit = (...args: string[]) =>
  promisify(execFile)(process.execPath, [join(repoRoot, 'packages/server/bin/bannerkit.js'), ...args])

test('selecting Layers records the Selection in .state.json for bannerkit inspect', async ({ page, projects }) => {
  await projects.write('s3-selection', { documents: { banner } })
  await page.goto(projects.appUrl('s3-selection', 'banner'))
  const canvas = page.locator('canvas.upper-canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const zoom = box.width / banner.canvas.width
  const at = (x: number, y: number) => [box.x + x * zoom, box.y + y * zoom] as const

  await page.mouse.click(...at(90, 70))
  await expect.poll(() => readState(projects.root, 's3-selection')).toEqual({ doc: 'banner', selectedLayerIds: ['rect-1'] })

  await page.keyboard.down('Shift')
  await page.mouse.click(...at(290, 130))
  await page.keyboard.up('Shift')
  await expect
    .poll(async () => (await readState(projects.root, 's3-selection'))?.selectedLayerIds?.toSorted())
    .toEqual(['rect-1', 'rect-2'])

  const { stdout } = await bannerkit('inspect', 's3-selection', '--root', projects.root, '--json')
  const { result } = JSON.parse(stdout)
  expect(result.name).toBe('banner')
  expect(result.layers.filter((l: { selected: boolean }) => l.selected).map((l: { id: string }) => l.id)).toEqual([
    'rect-1',
    'rect-2',
  ])

  await page.mouse.click(...at(380, 20))
  await expect.poll(() => readState(projects.root, 's3-selection')).toEqual({ doc: 'banner', selectedLayerIds: [] })
})

const grouped: Document = {
  ...banner,
  name: 'grouped',
  layers: [{ id: 'group-1', type: 'group', layers: banner.layers }],
}

test('a Layer selected inside a Group (double click) is the recorded Selection, marked in the inspect tree', async ({ page, projects }) => {
  await projects.write('s3-group-selection', { documents: { grouped } })
  await page.goto(projects.appUrl('s3-group-selection', 'grouped'))
  const canvas = page.locator('canvas.upper-canvas')
  await expect(canvas).toBeVisible()
  const box = (await canvas.boundingBox())!
  const zoom = box.width / grouped.canvas.width
  const at = (x: number, y: number) => [box.x + x * zoom, box.y + y * zoom] as const
  const state = () => readState(projects.root, 's3-group-selection')

  await page.mouse.click(...at(290, 130))
  await expect.poll(state).toEqual({ doc: 'grouped', selectedLayerIds: ['group-1'] })

  await page.mouse.dblclick(...at(290, 130))
  await expect.poll(state).toEqual({ doc: 'grouped', selectedLayerIds: ['rect-2'] })

  const { stdout } = await bannerkit('inspect', 's3-group-selection', '--root', projects.root, '--json')
  const { result } = JSON.parse(stdout)
  expect(result.layers[0].selected).toBe(false)
  expect(result.layers[0].layers.map((l: { id: string; selected: boolean }) => [l.id, l.selected])).toEqual([
    ['rect-1', false],
    ['rect-2', true],
  ])

  await page.keyboard.press('Escape')
  await expect.poll(state).toEqual({ doc: 'grouped', selectedLayerIds: ['group-1'] })
})
