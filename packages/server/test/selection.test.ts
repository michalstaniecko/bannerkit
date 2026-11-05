import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createProject, readSelection, writeSelection } from '../src/ops/index.ts'
import { tempRoot } from './harness.ts'

let root: string
beforeEach(async () => {
  root = await tempRoot()
  await createProject({ root, name: 'p' })
  await createDocument({ root, project: 'p', name: 'hero', size: { width: 300, height: 250 } })
})

describe('Selection', () => {
  it('is null before the editor records one', async () => {
    expect(await readSelection({ root, project: 'p' })).toBeNull()
  })

  it('writes { doc, selectedLayerIds } to the Project .state.json and reads it back', async () => {
    const written = await writeSelection({ root, project: 'p', doc: 'hero', selectedLayerIds: ['text-1', 'rect-2'] })

    expect(written).toEqual({ doc: 'hero', selectedLayerIds: ['text-1', 'rect-2'] })
    expect(JSON.parse(await readFile(join(root, 'p', '.state.json'), 'utf8'))).toEqual(written)
    expect(await readSelection({ root, project: 'p' })).toEqual(written)
  })

  it('replaces the previous Selection; an empty list means nothing is selected', async () => {
    await writeSelection({ root, project: 'p', doc: 'hero', selectedLayerIds: ['text-1'] })
    await writeSelection({ root, project: 'p', doc: 'hero', selectedLayerIds: [] })
    expect(await readSelection({ root, project: 'p' })).toEqual({ doc: 'hero', selectedLayerIds: [] })
  })

  it('refuses a Selection in a Document that does not exist', async () => {
    await expect(writeSelection({ root, project: 'p', doc: 'nope', selectedLayerIds: [] })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    })
  })

  it('refuses a missing Project', async () => {
    await expect(readSelection({ root, project: 'ghost' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('treats an unreadable or malformed .state.json as no Selection', async () => {
    await writeFile(join(root, 'p', '.state.json'), '{ not json')
    expect(await readSelection({ root, project: 'p' })).toBeNull()
    await writeFile(join(root, 'p', '.state.json'), JSON.stringify({ doc: 'hero' }))
    expect(await readSelection({ root, project: 'p' })).toBeNull()
  })
})
