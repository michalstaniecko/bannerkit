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
import { Canvas, Textbox, type FabricObject } from 'fabric'
import { facesUsed, loadBrowserFonts, measureText, type LoadFonts } from './fonts.ts'
import { exportCanvas, type ExportOptions, type ExportResult } from './export.ts'
import { layerToObject, objectToLayer } from './mapper.ts'
import { fitZoom, type Size } from './zoom.ts'

export type EditorOptions = {
  /**
   * Loads the fonts a Document uses before any text is created. Defaults to the
   * browser loader (`@font-face` from the font manifest + `document.fonts.load`);
   * tests without a FontFaceSet inject their own.
   */
  loadFonts?: LoadFonts
}

export type LoadOptions = {
  /** The URL an image Layer's project-relative `src` loads from. Defaults to `src` itself. */
  assetUrl?: (src: string) => string
}

export type Editor = {
  /** Creates the Fabric canvas inside `container`. Call once, before `load`. */
  mount(container: HTMLElement): void
  /**
   * Replaces whatever is shown with `document`, once its fonts and Assets have
   * loaded. A missing Asset shows as a hatched placeholder; a font that cannot be
   * loaded rejects, since text is never laid out in a fallback font.
   */
  load(document: Document, options?: LoadOptions): Promise<void>
  /** The Document as currently shown. */
  getDocument(): Document
  /** The Fabric object showing a Layer, for adapters that need it (Selection, tests). */
  objectFor(layerId: string): FabricObject | undefined
  /** Canvas px per Document px. The canvas element is resized to the zoomed Canvas size. */
  setZoom(zoom: number): void
  getZoom(): number
  /** Sets the zoom so the whole Canvas fits `viewport`, and returns it. */
  zoomToFit(viewport: Size): number
  /**
   * Exports the shown Document at exactly Canvas size × scale (whatever the zoom or
   * `devicePixelRatio`), supersampled 2× like the server, once its fonts and images are loaded.
   */
  export(options?: ExportOptions): Promise<ExportResult>
  destroy(): Promise<void>
}

type Entry = { base: Layer; object: FabricObject }

export function createEditor({ loadFonts = loadBrowserFonts }: EditorOptions = {}): Editor {
  let canvas: Canvas | undefined
  let current: Document | undefined
  let entries: Entry[] = []
  let zoom = 1
  /** Bumped by every `load`, so only the latest one shows its Document. */
  let loads = 0

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

    async load(document, { assetUrl = (src: string) => src } = {}) {
      const c = requireCanvas()
      const token = ++loads
      const next = structuredClone(document)
      // Fonts first: text is laid out (AutoFit, wrapping) only with the real font.
      await loadFonts(facesUsed(next))
      if (token !== loads || canvas !== c) return
      // Fabric caches glyph widths per family; anything still shown is re-measured.
      for (const object of c.getObjects()) if (object instanceof Textbox) object.initDimensions()
      c.requestRenderAll()

      const objects = await Promise.all(next.layers.map((layer) => layerToObject(layer, { assetUrl, measure: measureText })))
      if (token !== loads || canvas !== c) return // a newer load (or destroy) won
      c.discardActiveObject()
      c.remove(...c.getObjects())
      current = next
      entries = next.layers.map((layer, i) => ({ base: layer, object: objects[i]! }))
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

    async export(options) {
      const c = requireCanvas()
      if (!current) throw new Error('No Document loaded')
      const document = this.getDocument()
      await loadFonts(facesUsed(document))
      return exportCanvas(c, document.canvas, options)
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
export { EXPORT_FORMATS, exportFileName, type ExportFormat, type ExportOptions, type ExportResult, type ExportScale } from './export.ts'
