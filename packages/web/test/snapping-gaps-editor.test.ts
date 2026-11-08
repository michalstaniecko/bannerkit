// Snapping to equal gaps in the editor (jsdom + node-canvas): real mouse events on the
// canvas, asserted through the Document and `marks()`.
import { describe, expect, it } from 'vitest'
import { doc, gesture, leaves, openEditor, rect } from './editor-harness.ts'

const box = (id: string, x: number, y: number) => rect({ id, x, y, width: 40, height: 40 })

// a 10..50 and c 250..290 in the row y 100..140: a 40 px box sits between them with
// gaps of 80 at x 130. The dragged b starts at the Canvas origin.
const scene = () => doc([box('a', 10, 100), box('c', 250, 100), box('b', 0, 0)])

describe('dragging a Layer between two neighbours', () => {
  it('lands with equal gaps, the gaps marked with their px while dragging', async () => {
    const { editor, upper } = await openEditor(scene())
    const g = gesture(upper, [20, 20])
    g.move([80, 80])
    g.move([147, 120]) // raw offset (127, 100): 3 px short of the equal gaps

    expect(editor.marks().filter((m) => m.kind === 'gap')).toEqual([
      { kind: 'gap', axis: 'x', from: 50, to: 130, at: 120, label: '80' },
      { kind: 'gap', axis: 'x', from: 170, to: 250, at: 120, label: '80' },
    ])
    g.release()

    expect(leaves(editor.getDocument()).find((l) => l.id === 'b')).toMatchObject({ x: 130, y: 100 })
    expect(editor.marks()).toEqual([])
  })

  it('draws the gaps on the top canvas in the --snap colour, and clears them on release', async () => {
    const container = document.createElement('div')
    container.style.setProperty('--snap', '#00ff00')
    const { upper } = await openEditor(scene(), { container })
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
    const pixel = (x: number, y: number) => [...upper.getContext('2d')!.getImageData(x, y, 1, 1).data]
    const g = gesture(upper, [20, 20])
    g.move([80, 80])
    g.move([147, 110]) // b at y 90..130, snapped to nothing on y: the gap 50..130 runs along y = 115
    await frame()
    expect(pixel(60, 115)).toEqual([0, 255, 0, 255])
    expect(pixel(60, 119)).toEqual([0, 0, 0, 0])
    g.release()
    await frame()
    expect(pixel(60, 115)).toEqual([0, 0, 0, 0])
  })
})
