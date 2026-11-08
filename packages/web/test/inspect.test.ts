// inspect.ts on its own: which fields several Layers share, and Mixed toggles (hidden or
// locked Layers, the only ones that differ there, are selected from the Layer list),
// and font family/weight picked from a font manifest.
import { selectionBox, type Layer, type MeasureText, type TextLayer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import { layerFields, type FieldGroup } from '../src/inspector/fields.ts'
import { inspectField, MIXED, moveLayers, sharedFields } from '../src/inspector/inspect.ts'
import { doc, image, rect, text } from './editor-harness.ts'

const toggle = (key: string) => ({ control: 'toggle' as const, key, label: key, read: () => true, write: (l: Layer) => l })
const groups = (...specs: [string, string[]][]): FieldGroup[] => specs.map(([key, fields]) => ({ key, title: key, fields: fields.map(toggle) }))
const table = {
  rect: groups(['layout', ['x', 'y']], ['fill', ['fill', 'cornerRadius']]),
  text: groups(['layout', ['x', 'y']], ['fill', ['fill']], ['type', ['fontSize']]),
  image: groups(['layout', ['x']], ['fit', ['fit']]),
}
const measure: MeasureText = () => 0
const keys = (shown: FieldGroup[]) => shown.map((g) => [g.key, g.fields.map((f) => f.key)])

describe('sharedFields', () => {
  it('one Layer type shows all its fields', () => {
    expect(keys(sharedFields([rect(), rect({ id: 'b' })], table as never))).toEqual([
      ['layout', ['x', 'y']],
      ['fill', ['fill', 'cornerRadius']],
    ])
  })

  it('different types show only the fields they all have, dropping emptied groups', () => {
    expect(keys(sharedFields([rect(), text()], table as never))).toEqual([
      ['layout', ['x', 'y']],
      ['fill', ['fill']],
    ])
    expect(keys(sharedFields([rect(), text(), image()], table as never))).toEqual([['layout', ['x']]])
  })

  it('no Layers show no fields', () => {
    expect(sharedFields([], table as never)).toEqual([])
  })
})

describe('a toggle over several Layers', () => {
  const visible = sharedFields([rect()]).flatMap((g) => g.fields).find((f) => f.key === 'visible')!
  const layers = [rect({ id: 'a' }), rect({ id: 'b', visible: false })]
  const textLayout = () => ({ fontSize: 0, lines: [], height: 0, overflow: false })

  it('is Mixed when the Layers differ, and on for all once set', () => {
    const inspected = inspectField(visible, layers, { textLayout, measure })
    if (inspected.control !== 'toggle') throw new Error('not a toggle')

    expect(inspected.value).toBe(MIXED)
    expect(inspected.write(true)(doc(layers)).layers).toEqual([rect({ id: 'a' }), rect({ id: 'b' })])
  })
})

describe('font family and weight from a font manifest', () => {
  const face = (family: string, weight: TextLayer['fontWeight']) => ({ family, weight, style: 'normal' as const, file: `${family}-${weight}.ttf` })
  const manifest = [face('Inter', 400), face('Inter', 700), face('Serif', 300), face('Serif', 500), face('Serif', 900), face('Mono', 400)]
  const textLayout = () => ({ fontSize: 0, lines: [], height: 0, overflow: false })
  const inspect = (key: string, layers: Layer[]) => {
    const field = sharedFields(layers, layerFields(manifest)).flatMap((g) => g.fields).find((f) => f.key === key)!
    const inspected = inspectField(field, layers, { textLayout, measure })
    if (inspected.control !== 'select') throw new Error('not a select')
    return inspected
  }
  const values = (inspected: { options: readonly { value: string }[] }) => inspected.options.map((o) => o.value)

  it('offers the families of the manifest and the weights of the Layer’s family', () => {
    expect(values(inspect('fontFamily', [text({ fontWeight: 400 })]))).toEqual(['Inter', 'Serif', 'Mono'])
    expect(values(inspect('fontWeight', [text({ fontFamily: 'Serif', fontWeight: 500 })]))).toEqual(['300', '500', '900'])
  })

  it('a family without the Layer’s weight takes its nearest weight (a tie goes heavier)', () => {
    const write = (from: TextLayer, family: string) => inspect('fontFamily', [from]).write(family)(doc([from])).layers[0]
    expect(write(text({ fontWeight: 700 }), 'Serif')).toEqual(text({ fontFamily: 'Serif', fontWeight: 900 }))
    expect(write(text({ fontWeight: 700, id: 'x' }), 'Inter')).toEqual(text({ fontWeight: 700, id: 'x' }))
    expect(write(text({ fontWeight: 400 }), 'Serif')).toEqual(text({ fontFamily: 'Serif', fontWeight: 500 }))
    expect(write(text({ fontFamily: 'Serif', fontWeight: 900 }), 'Inter')).toEqual(text({ fontFamily: 'Inter', fontWeight: 700 }))
    expect(write(text({ fontFamily: 'Serif', fontWeight: 300 }), 'Mono')).toEqual(text({ fontFamily: 'Mono', fontWeight: 400 }))
  })

  it('several texts are offered only the weights all their families have', () => {
    const layers = [text({ id: 'a', fontWeight: 400 }), text({ id: 'b', fontFamily: 'Mono', fontWeight: 400 })]
    expect(values(inspect('fontWeight', layers))).toEqual(['400'])
    expect(inspect('fontFamily', layers).value).toBe(MIXED)
  })
})

describe('moveLayers and the Selection Box with a Group', () => {
  it('move every Layer inside a selected Group and bound its children', () => {
    const group: Layer = { id: 'g', type: 'group', layers: [rect({ id: 'a', x: 0, y: 0 }), { id: 'h', type: 'group', layers: [rect({ id: 'b', x: 200, y: 50 })] }] }

    const moved = moveLayers(doc([group]), ['g'], 5, 7)

    expect(selectionBox(moved.layers, measure)).toEqual({ x: 5, y: 7, width: 300, height: 100 })
  })
})

describe('italic from a font manifest', () => {
  const face = (weight: TextLayer['fontWeight'], style: 'normal' | 'italic', family = 'Inter') => ({
    family,
    weight,
    style,
    file: `${family}-${weight}-${style}.ttf`,
  })
  const manifest = [face(400, 'normal'), face(400, 'italic'), face(600, 'italic'), face(700, 'normal'), face(600, 'normal'), face(500, 'normal', 'Mono')]
  const textLayout = () => ({ fontSize: 0, lines: [], height: 0, overflow: false })
  const field = (key: string, layers: Layer[]) => sharedFields(layers, layerFields(manifest)).flatMap((g) => g.fields).find((f) => f.key === key)!
  const italic = (layers: Layer[]) => {
    const inspected = inspectField(field('fontStyle', layers), layers, { textLayout, measure })
    if (inspected.control !== 'toggle') throw new Error('not a toggle')
    return inspected
  }
  const select = (key: string, layers: Layer[]) => {
    const inspected = inspectField(field(key, layers), layers, { textLayout, measure })
    if (inspected.control !== 'select') throw new Error('not a select')
    return inspected
  }

  it('turns italic on, and off by leaving the key out', () => {
    const upright = text({ fontWeight: 400 })
    expect(italic([upright])).toMatchObject({ value: false, disabled: false })
    expect(italic([upright]).write(true)(doc([upright])).layers[0]).toEqual(text({ fontWeight: 400, fontStyle: 'italic' }))

    const slanted = text({ fontWeight: 400, fontStyle: 'italic' })
    expect(italic([slanted]).value).toBe(true)
    expect(italic([slanted]).write(false)(doc([slanted])).layers[0]).toEqual(text({ fontWeight: 400 }))
  })

  it('is disabled when the family has no italic file for the weight', () => {
    expect(italic([text({ fontWeight: 700 })]).disabled).toBe(true)
    expect(italic([text({ id: 'a', fontWeight: 400 }), text({ id: 'b', fontWeight: 700 })]).disabled).toBe(true)
  })

  it('is Mixed over upright and italic texts', () => {
    const layers = [text({ id: 'a', fontWeight: 400 }), text({ id: 'b', fontWeight: 400, fontStyle: 'italic' })]
    expect(italic(layers).value).toBe(MIXED)
  })

  it('an italic text is offered only the weights that have an italic file', () => {
    const values = (layers: Layer[]) => select('fontWeight', layers).options.map((o) => o.value)
    expect(values([text({ fontWeight: 400, fontStyle: 'italic' })])).toEqual(['400', '600'])
    expect(values([text({ fontWeight: 400 })])).toEqual(['400', '600', '700'])
  })

  it('an italic text moved to a family without italics becomes upright', () => {
    const from = text({ fontWeight: 600, fontStyle: 'italic' })
    expect(select('fontFamily', [from]).write('Mono')(doc([from])).layers[0]).toEqual(text({ fontFamily: 'Mono', fontWeight: 500 }))
    const upright = text({ fontWeight: 700 })
    expect(select('fontFamily', [upright]).write('Inter')(doc([upright])).layers[0]).toEqual(upright)
  })
})
