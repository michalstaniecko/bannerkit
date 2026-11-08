import { describe, expect, it } from 'vitest'
import { fontsInManifest, parseFontManifest, validateDocument } from '../src/index.ts'

const manifest = parseFontManifest([
  { family: 'Inter', weight: 400, style: 'normal', file: 'Inter-Regular.ttf' },
  { family: 'Inter', weight: 700, style: 'normal', file: 'Inter-Bold.ttf' },
])

const docWithText = (fontFamily: string, fontWeight: number) => ({
  version: 1,
  name: 'd',
  canvas: { width: 100, height: 100, background: null },
  layers: [
    { id: 'rect-1', type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#000000' },
    { id: 'text-1', type: 'text', x: 0, y: 0, width: 100, text: 'Hi', fontFamily, fontWeight, fontSize: 20, fill: '#000000' },
  ],
})

const italicManifest = parseFontManifest([
  { family: 'Inter', weight: 400, style: 'normal', file: 'Inter-Regular.ttf' },
  { family: 'Inter', weight: 400, style: 'italic', file: 'Inter-Italic.ttf' },
  { family: 'Inter', weight: 600, style: 'italic', file: 'Inter-SemiBoldItalic.ttf' },
  { family: 'Inter', weight: 700, style: 'normal', file: 'Inter-Bold.ttf' },
])

const italicText = (fontWeight: number, fontStyle?: string) => ({
  version: 2,
  name: 'd',
  canvas: { width: 100, height: 100, background: null },
  layers: [
    {
      id: 'text-1',
      type: 'text',
      x: 0,
      y: 0,
      width: 100,
      text: 'Hi',
      fontFamily: 'Inter',
      fontWeight,
      ...(fontStyle === undefined ? {} : { fontStyle }),
      fontSize: 20,
      fill: '#000000',
    },
  ],
})

describe('font manifest', () => {
  it('accepts italic text when the family/weight has an italic file', () => {
    const result = validateDocument(italicText(400, 'italic'), { rules: [fontsInManifest(italicManifest)] })
    expect(result.ok && result.document.layers[0]).toMatchObject({ fontStyle: 'italic' })
  })

  it('rejects italic text without an italic file, listing the weights that have one', () => {
    expect(validateDocument(italicText(700, 'italic'), { rules: [fontsInManifest(italicManifest)] }).errors).toEqual([
      {
        path: 'layers[0].fontStyle',
        message: 'font "Inter" has no italic for weight 700 in the font manifest (italic available for weights: 400, 600)',
      },
    ])
  })

  it('rejects normal text whose weight only ships an italic', () => {
    expect(validateDocument(italicText(600), { rules: [fontsInManifest(italicManifest)] }).errors).toEqual([
      {
        path: 'layers[0].fontStyle',
        message: 'font "Inter" has no normal for weight 600 in the font manifest (normal available for weights: 400, 700)',
      },
    ])
  })

  it('rejects a fontStyle other than normal or italic', () => {
    expect(validateDocument(italicText(400, 'oblique')).ok).toBe(false)
  })


  it('accepts family/weight pairs listed in the manifest', () => {
    expect(validateDocument(docWithText('Inter', 700), { rules: [fontsInManifest(manifest)] }).ok).toBe(true)
  })

  it('rejects a weight the family does not ship, listing the available ones', () => {
    expect(validateDocument(docWithText('Inter', 900), { rules: [fontsInManifest(manifest)] }).errors).toEqual([
      { path: 'layers[1].fontWeight', message: 'font "Inter" has no weight 900 in the font manifest (available: 400, 700)' },
    ])
  })

  it('rejects an unknown family with a "did you mean" suggestion', () => {
    expect(validateDocument(docWithText('Intr', 400), { rules: [fontsInManifest(manifest)] }).errors).toEqual([
      {
        path: 'layers[1].fontFamily',
        message: 'font family "Intr" is not in the font manifest (available: Inter)',
        suggestion: 'Inter',
      },
    ])
  })

  it('lists normal and italic faces of the same family/weight separately', () => {
    const faces = parseFontManifest([
      { family: 'Inter', weight: 400, style: 'normal', file: 'Inter-Regular.ttf' },
      { family: 'Inter', weight: 400, style: 'italic', file: 'Inter-Italic.ttf' },
    ])
    expect(faces.map((f) => f.style)).toEqual(['normal', 'italic'])
    expect(() =>
      parseFontManifest([
        { family: 'Inter', weight: 400, style: 'italic', file: 'a.ttf' },
        { family: 'Inter', weight: 400, style: 'italic', file: 'b.ttf' },
      ]),
    ).toThrow('font manifest: duplicate face Inter/400/italic')
    expect(() => parseFontManifest([{ family: 'Inter', weight: 400, style: 'oblique', file: 'x.ttf' }])).toThrow()
  })

  it('validates the manifest shape and rejects duplicate faces', () => {
    expect(() => parseFontManifest([{ family: 'Inter', weight: 450, style: 'normal', file: 'x.ttf' }])).toThrow()
    expect(() =>
      parseFontManifest([
        { family: 'Inter', weight: 400, style: 'normal', file: 'a.ttf' },
        { family: 'Inter', weight: 400, style: 'normal', file: 'b.ttf' },
      ]),
    ).toThrow(/duplicate/)
  })
})
