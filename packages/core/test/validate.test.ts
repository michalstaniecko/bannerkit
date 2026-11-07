import { describe, expect, it } from 'vitest'
import { validateDocument, type DocumentRule } from '../src/index.ts'

/** A Document using every Layer type and every optional field of schema v1. */
const fullDocument = () => ({
  $schema: '../../../packages/core/schema/document.schema.json',
  version: 1,
  name: 'hero',
  canvas: { width: 1200, height: 628, background: '#ffffff' },
  layers: [
    {
      id: 'rect-1',
      type: 'rect',
      x: 0,
      y: 0,
      width: 1200,
      height: 628,
      fill: { type: 'linear', angle: 90, stops: [['#ff0000', 0], ['#0000ff', 1]] },
      cornerRadius: 12,
      rotation: 0,
      opacity: 1,
      visible: true,
      locked: true,
      shadow: { color: 'rgba(0,0,0,0.5)', blur: 8, offsetX: 0, offsetY: 4 },
    },
    { id: 'image-1', type: 'image', x: 600, y: 40, width: 500, height: 500, src: 'assets/shoe.png', fit: 'contain' },
    {
      id: 'text-1',
      type: 'text',
      x: 40,
      y: 40,
      width: 500,
      height: 200,
      text: 'Spring sale',
      fontFamily: 'Inter',
      fontWeight: 700,
      fontSize: 64,
      lineHeight: 1.2,
      letterSpacing: -1,
      fill: '#111111',
      align: 'left',
      verticalAlign: 'middle',
      autoFit: { minFontSize: 24 },
    },
    { id: 'text-2', type: 'text', x: 40, y: 300, width: 500, text: 'From $49', fontFamily: 'Inter', fontWeight: 400, fontSize: 32, fill: '#111111' },
  ],
})

type Doc = ReturnType<typeof fullDocument>
const withDoc = (edit: (doc: Doc & Record<string, any>) => void) => {
  const doc = fullDocument() as Doc & Record<string, any>
  edit(doc)
  return doc
}

describe('validateDocument', () => {
  it('accepts a Document using every Layer type and optional field', () => {
    const result = validateDocument(fullDocument())

    expect(result).toEqual({ ok: true, document: { ...fullDocument(), version: 2 }, errors: [], warnings: [] })
  })

  it('reports an unknown key at its JSON path with a "did you mean" suggestion', () => {
    const doc = withDoc((d) => {
      const text = d.layers[2] as Record<string, unknown>
      text.fontWieght = text.fontWeight
      delete text.fontWeight
    })

    const result = validateDocument(doc)

    expect(result.ok).toBe(false)
    expect(result.errors).toContainEqual({
      path: 'layers[2].fontWieght',
      message: 'unknown key "fontWieght"',
      suggestion: 'fontWeight',
    })
  })

  it('suggests the intended value for a typo in an enum or Layer type', () => {
    const doc = withDoc((d) => {
      ;(d.layers[1] as Record<string, unknown>).fit = 'cvoer'
      ;(d.layers[3] as Record<string, unknown>).type = 'txt'
    })

    const { errors } = validateDocument(doc)

    expect(errors).toEqual([
      { path: 'layers[1].fit', message: 'expected "contain" | "cover" | "stretch", got "cvoer"', suggestion: 'cover' },
      { path: 'layers[3].type', message: 'expected "rect" | "image" | "text", got "txt"', suggestion: 'text' },
    ])
  })

  it('locates unknown keys inside nested objects (gradient, shadow, canvas)', () => {
    const doc = withDoc((d) => {
      const rect = d.layers[0] as any
      rect.fill.angel = 45
      rect.shadow.blurr = 2
      d.canvas = { ...d.canvas, backgroud: '#000' } as any
    })

    const { errors } = validateDocument(doc)

    expect(errors).toEqual(
      expect.arrayContaining([
        { path: 'layers[0].fill.angel', message: 'unknown key "angel"', suggestion: 'angle' },
        { path: 'layers[0].shadow.blurr', message: 'unknown key "blurr"', suggestion: 'blur' },
        { path: 'canvas.backgroud', message: 'unknown key "backgroud"', suggestion: 'background' },
      ]),
    )
  })

  it('gives no suggestion when an unknown key resembles nothing', () => {
    const doc = withDoc((d) => {
      d.zebra = true
    })

    expect(validateDocument(doc).errors).toEqual([{ path: 'zebra', message: 'unknown key "zebra"' }])
  })

  it('reports missing required fields, wrong types and an unsupported version together', () => {
    const doc = withDoc((d) => {
      d.version = 3 as any
      delete (d.layers[1] as Record<string, unknown>).src
      ;(d.layers[2] as Record<string, unknown>).fontWeight = 450
      ;(d.layers[0] as Record<string, unknown>).x = '10'
    })

    const { errors } = validateDocument(doc)

    expect(errors).toEqual(
      expect.arrayContaining([
        { path: 'version', message: 'expected 1 | 2, got 3' },
        { path: 'layers[1].src', message: 'missing required string' },
        expect.objectContaining({ path: 'layers[2].fontWeight', message: expect.stringContaining('got 450') }),
        { path: 'layers[0].x', message: 'expected number, got "10"' },
      ]),
    )
    expect(errors).toHaveLength(4)
  })

  it('rejects a fill that is neither a colour nor a LinearGradient', () => {
    const doc = withDoc((d) => {
      ;(d.layers[0] as Record<string, unknown>).fill = 5
    })

    expect(validateDocument(doc).errors).toEqual([
      { path: 'layers[0].fill', message: 'expected a CSS colour string or a LinearGradient object' },
    ])
  })

  it('rejects duplicate Layer ids, pointing at the later Layer', () => {
    const doc = withDoc((d) => {
      d.layers[3]!.id = 'text-1'
    })

    expect(validateDocument(doc)).toMatchObject({
      ok: false,
      errors: [{ path: 'layers[3].id', message: 'duplicate Layer id "text-1" (also used by layers[2])' }],
    })
  })

  it('rejects autoFit on a text Layer without height', () => {
    const doc = withDoc((d) => {
      delete (d.layers[2] as Record<string, unknown>).height
    })

    expect(validateDocument(doc).errors).toEqual([{ path: 'layers[2].autoFit', message: 'autoFit requires height' }])
  })

  it('runs extra rules, keeping warnings separate from errors', () => {
    const noShoes: DocumentRule = (document) =>
      document.layers.flatMap((layer, i) =>
        layer.type === 'image' && layer.src.includes('shoe')
          ? [{ path: `layers[${i}].src`, message: 'shoes are discouraged', severity: 'warning' as const }]
          : [],
      )

    const result = validateDocument(fullDocument(), { rules: [noShoes] })

    expect(result).toMatchObject({
      ok: true,
      errors: [],
      warnings: [{ path: 'layers[1].src', message: 'shoes are discouraged' }],
    })
  })
})

describe('Document versions', () => {
  it('lifts a valid v1 Document to v2 without changing anything else', () => {
    const result = validateDocument(fullDocument())

    expect(result.document?.version).toBe(2)
    expect(Object.keys(result.document!)).toEqual(['$schema', 'version', 'name', 'canvas', 'layers'])
  })

  it('accepts a v2 Document with Guides and returns it as is', () => {
    const doc = { ...fullDocument(), version: 2, guides: { x: [0, 600.5, -10], y: [] } }

    expect(validateDocument(doc)).toEqual({ ok: true, document: doc, errors: [], warnings: [] })
  })

  it('rejects a v2 field in a v1 Document with a hint to migrate', () => {
    const doc = { ...fullDocument(), guides: { x: [], y: [] } }

    const result = validateDocument(doc)

    expect(result.ok).toBe(false)
    expect(result.errors).toEqual([
      { path: 'guides', message: '"guides" requires version: 2; run `bannerkit migrate`' },
    ])
  })

  it('rejects fontStyle in a v1 Document with a hint to migrate', () => {
    const doc = fullDocument()
    const layers = doc.layers.map((layer) => (layer.id === 'text-2' ? { ...layer, fontStyle: 'italic' } : layer))

    expect(validateDocument({ ...doc, layers }).errors).toEqual([
      { path: 'layers[3].fontStyle', message: '"fontStyle" requires version: 2; run `bannerkit migrate`' },
    ])
  })

  it('accepts fontStyle in a v2 Document', () => {
    const doc = fullDocument()
    const layers = doc.layers.map((layer) => (layer.id === 'text-2' ? { ...layer, fontStyle: 'italic' } : layer))

    expect(validateDocument({ ...doc, version: 2, layers }).ok).toBe(true)
  })

  it('requires both Guide axes, with finite numbers only', () => {
    const v2 = (guides: unknown) => ({ ...fullDocument(), version: 2, guides })

    expect(validateDocument(v2({ x: [] })).errors).toEqual([{ path: 'guides.y', message: 'missing required array' }])
    expect(validateDocument(v2({ x: [1, 'a'], y: [] })).errors).toEqual([
      { path: 'guides.x[1]', message: 'expected number, got "a"' },
    ])
    expect(validateDocument(v2({ x: [Infinity], y: [] })).ok).toBe(false)
    expect(validateDocument(v2({ x: [], y: [], zebra: [] })).errors).toEqual([{ path: 'guides.zebra', message: 'unknown key "zebra"' }])
  })

  it('reports a missing version as expecting 1 or 2', () => {
    const { version: _, ...doc } = fullDocument()

    expect(validateDocument(doc).errors).toEqual([{ path: 'version', message: 'missing; expected 1 | 2' }])
  })
})
