import { describe, expect, it } from 'vitest'
import { rotateGroup, scaleGroup, type GroupLayer, type MeasureText } from '../src/index.ts'

const measure: MeasureText = (_font, text) => text.length * 5

const rect = (id: string, over: Record<string, unknown> = {}) => ({ id, type: 'rect' as const, x: 0, y: 0, width: 10, height: 10, fill: '#000', ...over })

const group = (layers: unknown[], over: Record<string, unknown> = {}) => ({ id: 'group-1', type: 'group', layers, ...over }) as GroupLayer

describe('scaleGroup', () => {
  it('scales positions relative to the anchor and sizes by the factor', () => {
    const g = group([rect('a', { x: 10, y: 20, width: 30, height: 40 }), rect('b', { x: 50, y: 20, width: 10, height: 10 })])

    const scaled = scaleGroup(g, 2, { x: 10, y: 20 })

    expect(scaled.layers).toEqual([
      rect('a', { x: 10, y: 20, width: 60, height: 80 }),
      rect('b', { x: 90, y: 20, width: 20, height: 20 }),
    ])
  })

  it('scales the size fields of text, rects and shadows, keeping rotations and everything else', () => {
    const text = {
      id: 't',
      type: 'text' as const,
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 30,
      text: 'Sale',
      fontFamily: 'Inter',
      fontWeight: 700 as const,
      fontSize: 24,
      lineHeight: 1.2,
      letterSpacing: 2,
      autoFit: { minFontSize: 10 },
      fill: '#000',
      opacity: 0.5,
    }
    const g = group([rect('r', { cornerRadius: 8, rotation: -15, shadow: { color: '#000', blur: 4, offsetX: 2, offsetY: -3 } }), text])

    const [r, t] = scaleGroup(g, 1.5, { x: 0, y: 0 }).layers

    expect(r).toEqual(rect('r', { width: 15, height: 15, cornerRadius: 12, rotation: -15, shadow: { color: '#000', blur: 6, offsetX: 3, offsetY: -4.5 } }))
    expect(t).toEqual({ ...text, width: 150, height: 60, fontSize: 36, letterSpacing: 3, autoFit: { minFontSize: 15 } })
  })

  it('rounds Box fields to whole px and the other sizes to 0.1', () => {
    const text = { id: 't', type: 'text' as const, x: 3, y: 5, width: 33, text: 'Hi', fontFamily: 'Inter', fontWeight: 400 as const, fontSize: 13, letterSpacing: 0.7, fill: '#000' }
    const g = group([rect('r', { x: 1, y: 1, width: 11, height: 7, cornerRadius: 3 }), text])

    const [r, t] = scaleGroup(g, 1 / 3, { x: 0, y: 0 }).layers

    expect(r).toEqual(rect('r', { x: 0, y: 0, width: 4, height: 2, cornerRadius: 1 }))
    expect(t).toEqual({ ...text, x: 1, y: 2, width: 11, fontSize: 4.3, letterSpacing: 0.2 })
  })

  it('scales the Layers of nested Groups, keeping the Groups themselves', () => {
    const inner = group([rect('b', { x: 20, y: 20 })], { id: 'group-2', opacity: 0.5 })
    const g = group([rect('a'), inner], { name: 'Badge' })

    const scaled = scaleGroup(g, 2, { x: 10, y: 10 })

    expect(scaled).toEqual(group([rect('a', { x: -10, y: -10, width: 20, height: 20 }), group([rect('b', { x: 30, y: 30, width: 20, height: 20 })], { id: 'group-2', opacity: 0.5 })], { name: 'Badge' }))
  })

  it('never shrinks a font size to zero', () => {
    const text = { id: 't', type: 'text' as const, x: 0, y: 0, width: 10, text: 'Hi', fontFamily: 'Inter', fontWeight: 400 as const, fontSize: 2, autoFit: { minFontSize: 1 }, fill: '#000' }

    const [t] = scaleGroup(group([text]), 0.01, { x: 0, y: 0 }).layers

    expect(t).toMatchObject({ fontSize: 0.1, autoFit: { minFontSize: 0.1 } })
  })
})

describe('rotateGroup', () => {
  it("turns each child's centre around the Group Box centre and adds the angle to its rotation", () => {
    const g = group([rect('a'), rect('b', { x: 30, rotation: 10 })])

    const turned = rotateGroup(g, 90, measure)

    expect(turned.layers).toEqual([rect('a', { x: 15, y: -15, rotation: 90 }), rect('b', { x: 15, y: 15, rotation: 100 })])
  })

  it('puts positions on whole px and rotations on 0.1°', () => {
    const g = group([rect('a', { rotation: 10.04 }), rect('b', { x: 30, rotation: 10.04 })])

    const turned = rotateGroup(g, 33.33, measure)

    // centres (5, 5) and (35, 5) around (20, 5): ±15 px at 33.33° → (±12.53, ±8.24)
    expect(turned.layers).toEqual([rect('a', { x: 2, y: -8, rotation: 43.4 }), rect('b', { x: 28, y: 8, rotation: 43.4 })])
  })

  it('turns a text Layer without height around the centre of its Text Layout', () => {
    const text = { id: 't', type: 'text' as const, x: 10, y: 10, width: 100, text: 'Hi', fontFamily: 'Inter', fontWeight: 400 as const, fontSize: 10, fill: '#000' }

    const [t] = rotateGroup(group([text]), 180, measure).layers

    expect(t).toEqual({ ...text, rotation: 180 })
  })

  it('turns the Layers of nested Groups around the outer Group Box centre', () => {
    const g = group([rect('a'), group([rect('b', { x: 30 })], { id: 'group-2' })])

    const turned = rotateGroup(g, -90, measure)

    expect(turned).toEqual(group([rect('a', { x: 15, y: 15, rotation: -90 }), group([rect('b', { x: 15, y: -15, rotation: -90 })], { id: 'group-2' })]))
  })
})
