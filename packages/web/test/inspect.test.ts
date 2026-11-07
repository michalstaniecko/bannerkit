// inspect.ts on its own: which fields several Layers share, and Mixed toggles (hidden or
// locked Layers, the only ones that differ there, are selected from the Layer list).
import type { Layer } from '@bannerkit/core'
import { describe, expect, it } from 'vitest'
import type { FieldGroup } from '../src/inspector/fields.ts'
import { inspectField, MIXED, sharedFields } from '../src/inspector/inspect.ts'
import { doc, image, rect, text } from './editor-harness.ts'

const toggle = (key: string) => ({ control: 'toggle' as const, key, label: key, read: () => true, write: (l: Layer) => l })
const groups = (...specs: [string, string[]][]): FieldGroup[] => specs.map(([key, fields]) => ({ key, title: key, fields: fields.map(toggle) }))
const table = {
  rect: groups(['layout', ['x', 'y']], ['fill', ['fill', 'cornerRadius']]),
  text: groups(['layout', ['x', 'y']], ['fill', ['fill']], ['type', ['fontSize']]),
  image: groups(['layout', ['x']], ['fit', ['fit']]),
}
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
  const textHeight = () => 0

  it('is Mixed when the Layers differ, and on for all once set', () => {
    const inspected = inspectField(visible, layers, { textHeight })
    if (inspected.control !== 'toggle') throw new Error('not a toggle')

    expect(inspected.value).toBe(MIXED)
    expect(inspected.write(true)(doc(layers)).layers).toEqual([rect({ id: 'a' }), rect({ id: 'b' })])
  })
})
