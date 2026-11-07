import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOCUMENT_SCHEMA_FILE, documentJsonSchema, nextLayerId, type Layer } from '../src/index.ts'

const committedSchemaPath = join(import.meta.dirname, '..', DOCUMENT_SCHEMA_FILE)

describe('documentJsonSchema', () => {
  it('is committed up to date (regenerate with `pnpm schema`)', async () => {
    const committed = JSON.parse(await readFile(committedSchemaPath, 'utf8'))

    expect(committed).toEqual(documentJsonSchema())
  })

  it('describes every Layer type strictly, so editors can complete and flag keys', () => {
    const schema = documentJsonSchema() as any
    const text = schema.$defs.TextLayer

    expect(schema.additionalProperties).toBe(false)
    expect(text.additionalProperties).toBe(false)
    expect(text.properties.fontWeight.enum).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900])
    expect(Object.keys(schema.$defs)).toEqual(expect.arrayContaining(['RectLayer', 'ImageLayer', 'TextLayer', 'LinearGradient']))
  })

  it('describes Document v2, with optional Guides on both axes', () => {
    const schema = documentJsonSchema() as any

    expect(schema.properties.version.const).toBe(2)
    expect(schema.required).not.toContain('guides')
    expect(schema.$defs.Guides.required).toEqual(['x', 'y'])
    expect(schema.$defs.Guides.additionalProperties).toBe(false)
  })
})

describe('nextLayerId', () => {
  it('generates readable <type>-<n> ids that do not collide', () => {
    const rect = (id: string): Layer => ({ id, type: 'rect', x: 0, y: 0, width: 1, height: 1, fill: '#000' })
    const root = { layers: ['text-1', 'image-3', 'hero-text', 'text-2'].map(rect) }

    expect(nextLayerId(root, 'text')).toBe('text-3')
    expect(nextLayerId(root, 'image')).toBe('image-4')
    expect(nextLayerId(root, 'rect')).toBe('rect-1')
  })

  it('counts ids anywhere in the tree and names Groups group-<n>', () => {
    const rect = (id: string): Layer => ({ id, type: 'rect', x: 0, y: 0, width: 1, height: 1, fill: '#000' })
    const root = { layers: [rect('rect-1'), { id: 'group-2', type: 'group', layers: [rect('rect-4')] } satisfies Layer] }

    expect(nextLayerId(root, 'rect')).toBe('rect-5')
    expect(nextLayerId(root, 'group')).toBe('group-3')
  })
})
