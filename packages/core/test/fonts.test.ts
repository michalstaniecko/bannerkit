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

describe('font manifest', () => {
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
