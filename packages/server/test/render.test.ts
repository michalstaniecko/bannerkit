import { layoutText, type Document, type Layer, type TextLayer } from '@bannerkit/core'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { measureText } from '../src/render/fonts.ts'
import { renderDocument } from '../src/render/renderDocument.ts'
import { expectImageSnapshot } from './snapshot.ts'

function doc(layers: Layer[], background: string | null = '#ffffff', width = 200, height = 100): Document {
  return { version: 2, name: 'test', canvas: { width, height, background }, layers }
}

async function pixels(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return (x: number, y: number) => {
    const i = (y * info.width + x) * 4
    return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!]
  }
}

/** Asserts every channel is within `tol` of the expected RGBA. */
function near(actual: number[], expected: number[], tol = 3) {
  expect(actual.every((v, i) => Math.abs(v - expected[i]!) <= tol), `${actual} ≈ ${expected}`).toBe(true)
}

/** Bounding box of pixels darker than mid-grey (the ink of black text on white). */
async function inkBounds(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4]! < 128) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
  }
  return { minX, minY, maxX, maxY }
}

const textLayer = (extra: Partial<TextLayer>): TextLayer => ({
  id: 'text-1',
  type: 'text',
  x: 20,
  y: 10,
  width: 160,
  text: 'Hello',
  fontFamily: 'Inter',
  fontWeight: 700,
  fontSize: 24,
  fill: '#000000',
  ...extra,
})

describe('renderDocument: text Layers', () => {
  it('wraps at the Box width and draws each core line at its position', async () => {
    const layer = textLayer({ text: 'Spring sale on every shoe', lineHeight: 1.2 })
    const layout = layoutText(layer, measureText)
    expect(layout.lines.length).toBeGreaterThan(1)

    const png = await renderDocument(doc([layer], '#ffffff', 200, 120))
    const ink = await inkBounds(png)
    // Left aligned at the Box left; the last baseline is where core put it (descender-free text sits on it).
    expect(ink.minX).toBeGreaterThanOrEqual(20)
    expect(ink.minX).toBeLessThanOrEqual(23)
    expect(ink.maxX).toBeLessThanOrEqual(180)
    expect(ink.minY).toBeGreaterThanOrEqual(10)
    await expectImageSnapshot('text-wrap-left', png)
  })

  it('draws text in the case textTransform asks for', async () => {
    const typed = await renderDocument(doc([textLayer({ text: 'Spring sale', textTransform: 'uppercase' })]))
    const uppercase = await renderDocument(doc([textLayer({ text: 'SPRING SALE' })]))
    const asTyped = await renderDocument(doc([textLayer({ text: 'Spring sale' })]))

    expect(typed.equals(uppercase)).toBe(true)
    expect(typed.equals(asTyped)).toBe(false)
  })

  it('honours align, verticalAlign and letterSpacing', async () => {
    const layer = textLayer({ text: 'SALE', align: 'right', verticalAlign: 'bottom', height: 100, letterSpacing: 4 })
    const png = await renderDocument(doc([layer], '#ffffff', 200, 120))
    const ink = await inkBounds(png)
    const [line] = layoutText(layer, measureText).lines
    // Right aligned: the drawn line ends at the Box right edge (the trailing letterSpacing is not part of it).
    expect(ink.maxX).toBeGreaterThanOrEqual(176)
    expect(ink.maxX).toBeLessThanOrEqual(180)
    expect(ink.minX).toBeCloseTo(20 + line!.x, -1)
    // Bottom aligned: "SALE" has no descenders, so its ink ends on the baseline.
    expect(ink.maxY).toBeCloseTo(10 + line!.baselineY, -0.5)
    await expectImageSnapshot('text-align-right-bottom', png)
  })

  it('AutoFits a headline into its Box', async () => {
    const layer = textLayer({
      text: 'Everything must go this weekend',
      fontSize: 48,
      height: 80,
      align: 'center',
      verticalAlign: 'middle',
      autoFit: { minFontSize: 10 },
    })
    const layout = layoutText(layer, measureText)
    expect(layout.fontSize).toBeLessThan(48)
    expect(layout.overflow).toBe(false)
    const png = await renderDocument(doc([layer], '#ffffff', 200, 100))
    const ink = await inkBounds(png)
    expect(ink.minY).toBeGreaterThanOrEqual(10)
    expect(ink.maxY).toBeLessThanOrEqual(90)
    await expectImageSnapshot('text-autofit-center-middle', png)
  })

  it('clips text that still overflows at the minimum size to the Box', async () => {
    const layer = textLayer({ text: 'Supercalifragilistic', width: 100, height: 30, autoFit: { minFontSize: 20 } })
    expect(layoutText(layer, measureText)).toMatchObject({ fontSize: 20, overflow: true })
    const png = await renderDocument(doc([layer], '#ffffff', 200, 60))
    const ink = await inkBounds(png)
    expect(ink.maxX).toBeLessThanOrEqual(120)
    expect(ink.maxX).toBeGreaterThan(115)
    await expectImageSnapshot('text-overflow-clipped', png)
  })

  it('rotates text with its Box and applies opacity and shadow', async () => {
    const layer = textLayer({
      text: 'New in',
      fill: '#ffffff',
      height: 40,
      align: 'center',
      verticalAlign: 'middle',
      rotation: -15,
      opacity: 0.9,
      shadow: { color: 'rgba(0,0,0,0.7)', blur: 4, offsetX: 2, offsetY: 3 },
    })
    const png = await renderDocument(doc([{ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 200, height: 60, fill: '#3366ff' }, layer], '#ffffff', 200, 60))
    await expectImageSnapshot('text-rotated-shadow', png)
  })

  it('draws italic text from the italic font file', async () => {
    const italic = await renderDocument(doc([textLayer({ text: 'Italic sale', fontStyle: 'italic' })]))
    const upright = await renderDocument(doc([textLayer({ text: 'Italic sale' })]))
    expect(italic.equals(upright)).toBe(false)
    // The line ends where core measured it with the italic face.
    const layout = layoutText(textLayer({ text: 'Italic sale', fontStyle: 'italic' }), measureText)
    const ink = await inkBounds(italic)
    expect(Math.abs(ink.maxX - (20 + layout.lines[0]!.width))).toBeLessThanOrEqual(3)
    await expectImageSnapshot('text-italic', italic)
  })

  it('refuses to draw a font missing from the manifest instead of falling back', async () => {
    await expect(renderDocument(doc([textLayer({ fontFamily: 'Helvetica' })]))).rejects.toThrow(/not registered/)
  })
})

describe('renderDocument: rect Layers', () => {
  it('fills a linear gradient along the CSS angle (90 = to right)', async () => {
    const png = await renderDocument(
      doc([
        {
          id: 'rect-1',
          type: 'rect',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          fill: { type: 'linear', angle: 90, stops: [['#ff0000', 0], ['#0000ff', 1]] },
        },
      ]),
    )
    const at = await pixels(png)
    near(at(1, 50), [254, 0, 1, 255], 4)
    near(at(198, 50), [1, 0, 254, 255], 4)
    // Constant along the vertical: 90deg has no y component.
    expect(at(100, 5)).toEqual(at(100, 95))
    await expectImageSnapshot('rect-gradient-90', png)
  })

  it('rounds corners by cornerRadius', async () => {
    const png = await renderDocument(
      doc([{ id: 'rect-1', type: 'rect', x: 20, y: 10, width: 160, height: 80, fill: '#ff0000', cornerRadius: 30 }]),
    )
    const at = await pixels(png)
    // The corner pixel sits outside a 30px radius arc; the straight edge is still filled.
    near(at(22, 12), [255, 255, 255, 255])
    near(at(177, 87), [255, 255, 255, 255])
    near(at(100, 11), [255, 0, 0, 255])
    near(at(21, 50), [255, 0, 0, 255])
    near(at(30, 20), [255, 0, 0, 255])
    await expectImageSnapshot('rect-corner-radius', png)
  })

  it('rotates in degrees around the Box centre, with x/y the unrotated top-left', async () => {
    // A 120×20 bar centred on (100, 50). At 90deg it stands upright: x 90-110, y -10..110.
    const png = await renderDocument(
      doc([{ id: 'rect-1', type: 'rect', x: 40, y: 40, width: 120, height: 20, fill: '#00ff00', rotation: 90 }]),
    )
    const at = await pixels(png)
    near(at(100, 5), [0, 255, 0, 255])
    near(at(100, 95), [0, 255, 0, 255])
    near(at(92, 50), [0, 255, 0, 255])
    near(at(50, 50), [255, 255, 255, 255])
    near(at(150, 50), [255, 255, 255, 255])
    near(at(115, 50), [255, 255, 255, 255])
    await expectImageSnapshot('rect-rotation-90', png)
  })

  it('rotates a gradient with its Box', async () => {
    // Gradient 90 = to right in Box space; rotated 90deg clockwise it runs top to bottom.
    const png = await renderDocument(
      doc(
        [
          {
            id: 'rect-1',
            type: 'rect',
            x: 0,
            y: 50,
            width: 100,
            height: 100,
            rotation: 90,
            fill: { type: 'linear', angle: 90, stops: [['#ff0000', 0], ['#0000ff', 1]] },
            cornerRadius: 10,
          },
        ],
        null,
        100,
        200,
      ),
    )
    const at = await pixels(png)
    near(at(50, 52), [253, 0, 2, 255], 6)
    near(at(50, 147), [2, 0, 253, 255], 6)
    expect(at(50, 25)[3]).toBe(0)
    await expectImageSnapshot('rect-rotation-gradient', png)
  })

  it('applies opacity (0-1) to a Layer', async () => {
    const png = await renderDocument(
      doc([{ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 200, height: 100, fill: '#000000', opacity: 0.25 }]),
    )
    const at = await pixels(png)
    near(at(100, 50), [191, 191, 191, 255], 2)
    await expectImageSnapshot('rect-opacity', png)
  })

  it('does not draw hidden Layers', async () => {
    const png = await renderDocument(
      doc([{ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 200, height: 100, fill: '#000000', visible: false }]),
    )
    const at = await pixels(png)
    expect(at(100, 50)).toEqual([255, 255, 255, 255])
  })

  it('casts a shadow with colour, blur and offset in Canvas pixels', async () => {
    const png = await renderDocument(
      doc([
        {
          id: 'rect-1',
          type: 'rect',
          x: 40,
          y: 20,
          width: 60,
          height: 40,
          fill: '#ff0000',
          shadow: { color: '#000000', blur: 0, offsetX: 30, offsetY: 20 },
        },
      ]),
    )
    const at = await pixels(png)
    // Offset shadow pokes out right and below by exactly the offset, at Canvas scale (not 2× supersample).
    near(at(70, 40), [255, 0, 0, 255])
    // Shadow covers x 70-130, y 40-80.
    near(at(128, 78), [0, 0, 0, 255])
    near(at(132, 70), [255, 255, 255, 255])
    near(at(115, 82), [255, 255, 255, 255])
    near(at(68, 70), [255, 255, 255, 255])
  })

  it('blurs a shadow and combines it with opacity and rotation', async () => {
    const png = await renderDocument(
      doc([
        {
          id: 'rect-1',
          type: 'rect',
          x: 60,
          y: 30,
          width: 80,
          height: 40,
          fill: '#3366ff',
          rotation: 20,
          opacity: 0.8,
          cornerRadius: 8,
          shadow: { color: 'rgba(0,0,0,0.6)', blur: 12, offsetX: 6, offsetY: 8 },
        },
      ]),
    )
    await expectImageSnapshot('rect-shadow-blur', png)
  })

  it('renders a null Canvas background as transparent PNG alpha', async () => {
    const png = await renderDocument(
      doc(
        [{ id: 'rect-1', type: 'rect', x: 50, y: 25, width: 100, height: 50, fill: 'rgba(255,0,0,0.5)', cornerRadius: 12 }],
        null,
      ),
    )
    expect((await sharp(png).metadata()).hasAlpha).toBe(true)
    const at = await pixels(png)
    expect(at(10, 10)[3]).toBe(0)
    near(at(100, 50), [255, 0, 0, 128], 2)
    await expectImageSnapshot('rect-transparent-canvas', png)
  })
})

describe('renderDocument: Groups', () => {
  const red: Layer = { id: 'red', type: 'rect', x: 0, y: 0, width: 120, height: 100, fill: '#ff0000' }
  const blue: Layer = { id: 'blue', type: 'rect', x: 80, y: 0, width: 120, height: 100, fill: '#0000ff' }

  it('composites a Group with opacity as one surface, not child by child (CSS opacity)', async () => {
    const png = await renderDocument(doc([{ id: 'group-1', type: 'group', opacity: 0.5, layers: [red, blue] }]))
    const at = await pixels(png)
    // Where the children overlap, blue covers red before the Group fades: half blue on white.
    near(at(100, 50), [128, 128, 255, 255], 3)
    near(at(40, 50), [255, 128, 128, 255], 3)
    near(at(160, 50), [128, 128, 255, 255], 3)

    // Fading each child instead would let red show through blue in the overlap.
    const perChild = await renderDocument(doc([{ ...red, opacity: 0.5 }, { ...blue, opacity: 0.5 }]))
    near((await pixels(perChild))(100, 50), [128, 64, 191, 255], 3)
    await expectImageSnapshot('group-opacity', png)
  })

  it('draws a Group at full opacity like its children on their own', async () => {
    const grouped = await renderDocument(doc([{ id: 'group-1', type: 'group', layers: [red, { ...blue, rotation: 20 }] }]))
    const flat = await renderDocument(doc([red, { ...blue, rotation: 20 }]))

    expect(grouped.equals(flat)).toBe(true)
  })

  it('multiplies the opacity of nested Groups', async () => {
    const png = await renderDocument(
      doc([
        { id: 'outer', type: 'group', opacity: 0.5, layers: [{ id: 'inner', type: 'group', opacity: 0.5, layers: [{ ...red, fill: '#000000' }] }] },
      ]),
    )
    near((await pixels(png))(40, 50), [191, 191, 191, 255], 3)
  })

  it('skips a hidden Group with everything in it', async () => {
    const png = await renderDocument(doc([{ id: 'group-1', type: 'group', visible: false, layers: [red, blue] }]))
    expect((await pixels(png))(100, 50)).toEqual([255, 255, 255, 255])
  })
})
