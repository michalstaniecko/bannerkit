import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DOCUMENT_SCHEMA_FILE, documentJsonSchema, nextLayerId } from '../src/index.ts'

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
})

describe('nextLayerId', () => {
  it('generates readable <type>-<n> ids that do not collide', () => {
    const layers = [{ id: 'text-1' }, { id: 'image-3' }, { id: 'hero-text' }, { id: 'text-2' }]

    expect(nextLayerId(layers, 'text')).toBe('text-3')
    expect(nextLayerId(layers, 'image')).toBe('image-4')
    expect(nextLayerId(layers, 'rect')).toBe('rect-1')
  })
})
