// The editor module: framework-agnostic, owns one fabric.Canvas. React (or anything
// else) renders chrome around it and talks to it only through `Editor`; Fabric
// objects never leave this module as state.
//
// Model: `load` keeps the Document and lays each Layer out as one Fabric object,
// bottom → top, in a parallel `Entry` list. `getDocument` rebuilds the Document from
// the objects via the mapper, so whatever Fabric shows is what you get back.
// Later tickets extend this file: interaction → `objectToLayer` on `object:modified`
// (12), snapshots (13), Layer list actions (14), `apply` (15), `on('change')` (16),
// `on('selection')` (17) and `export` (18).
import type { Document, Layer } from '@bannerkit/core'
import { Canvas, type FabricObject } from 'fabric'
import { layerToObject, objectToLayer } from './mapper.ts'
import { fitZoom, type Size } from './zoom.ts'

export type Editor = {
  /** Creates the Fabric canvas inside `container`. Call once, before `load`. */
  mount(container: HTMLElement): void
  /** Replaces whatever is shown with `document`. */
  load(document: Document): Promise<void>
  /** The Document as currently shown. */
  getDocument(): Document
  /** The Fabric object showing a Layer, for adapters that need it (Selection, tests). */
  objectFor(layerId: string): FabricObject | undefined
  /** Canvas px per Document px. The canvas element is resized to the zoomed Canvas size. */
  setZoom(zoom: number): void
  getZoom(): number
  /** Sets the zoom so the whole Canvas fits `viewport`, and returns it. */
  zoomToFit(viewport: Size): number
  destroy(): Promise<void>
}

type Entry = { base: Layer; object: FabricObject }

export function createEditor(): Editor {
  let canvas: Canvas | undefined
  let current: Document | undefined
  let entries: Entry[] = []
  let zoom = 1

  const requireCanvas = (): Canvas => {
    if (!canvas) throw new Error('Editor is not mounted; call mount(container) first')
    return canvas
  }

  const applyZoom = () => {
    const c = requireCanvas()
    if (current) {
      const { width, height } = current.canvas
      c.setDimensions({ width: Math.round(width * zoom), height: Math.round(height * zoom) })
    }
    c.setZoom(zoom)
    c.requestRenderAll()
  }

  return {
    mount(container) {
      if (canvas) throw new Error('Editor is already mounted')
      const element = container.ownerDocument.createElement('canvas')
      container.append(element)
      canvas = new Canvas(element, { preserveObjectStacking: true })
    },

    async load(document) {
      const c = requireCanvas()
      c.discardActiveObject()
      c.remove(...c.getObjects())
      current = structuredClone(document)
      entries = current.layers.map((layer) => ({ base: layer, object: layerToObject(layer) }))
      c.backgroundColor = current.canvas.background ?? ''
      c.add(...entries.map((e) => e.object))
      applyZoom()
      c.renderAll()
    },

    getDocument() {
      if (!current) throw new Error('No Document loaded')
      return { ...structuredClone(current), layers: entries.map((e) => objectToLayer(e.object, e.base)) }
    },

    objectFor(layerId) {
      return entries.find((e) => e.base.id === layerId)?.object
    },

    setZoom(value) {
      if (!(value > 0) || !Number.isFinite(value)) throw new Error(`Zoom must be a positive number, got ${value}`)
      zoom = value
      applyZoom()
      requireCanvas().renderAll()
    },

    getZoom: () => zoom,

    zoomToFit(viewport) {
      if (!current) throw new Error('No Document loaded')
      this.setZoom(fitZoom(current.canvas, viewport))
      return zoom
    },

    async destroy() {
      const c = canvas
      canvas = undefined
      current = undefined
      entries = []
      await c?.dispose()
    },
  }
}

export type { Size } from './zoom.ts'
