import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProject } from '../src/ops/index.ts'
import { tempRoot, tree } from './harness.ts'

describe('createProject', () => {
  it('creates project.json and the documents, assets and exports folders', async () => {
    const root = await tempRoot()

    const result = await createProject({ root, name: 'spring-sale' })

    expect(result).toEqual({ name: 'spring-sale', path: join(root, 'spring-sale') })
    expect(await tree(join(root, 'spring-sale'))).toEqual([
      'assets/',
      'documents/',
      'exports/',
      'project.json',
    ])
    const projectJson = JSON.parse(await readFile(join(root, 'spring-sale', 'project.json'), 'utf8'))
    expect(projectJson).toEqual({ version: 1, name: 'spring-sale' })
  })

  it('refuses to overwrite an existing Project', async () => {
    const root = await tempRoot()
    await createProject({ root, name: 'p' })

    await expect(createProject({ root, name: 'p' })).rejects.toMatchObject({ code: 'ALREADY_EXISTS' })
  })

  it.each(['../escape', 'a/b', '.hidden', ''])('rejects the unsafe name %j', async (name) => {
    const root = await tempRoot()

    await expect(createProject({ root, name })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })
})
