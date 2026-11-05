// The editor module: framework-agnostic, owns one fabric.Canvas. React (or anything
// else) renders chrome around it and talks to it only through `Editor`; Fabric
// objects never leave this module as state.
//
// Model: `load` keeps the Document and lays each Layer out as one Fabric object,
// bottom → top, in a parallel `Entry` list. `getDocument` rebuilds the Document from
// the objects via the mapper, so whatever Fabric shows is what you get back.
//
// Direct manipulation: Fabric runs the drag, scale, rotate and text editing. When
// one *logical modification* ends (a transform's `object:modified`, a text edit's
// exit with changed text, an arrow-key nudge) the editor commits it: each touched
// Layer is read back with `objectToLayer`, stored as its Entry's base, and applied
// again with `applyLayer`, which bakes scale into `width`/`height` (ADR 0001). Then
// exactly one `change` event carries the new Document. Autosave, undo snapshots (13)
// and anything else that follows edits hang on `change`.
//
// Later tickets extend this file: snapshots (13), Layer list actions (14),
// `apply` (15), Selection sent to the server (17) and `export` (18).
import type { Document, Layer, TextLayer } from '@bannerkit/core'
import { ActiveSelection, Canvas, Textbox, type FabricObject, type Point } from 'fabric'
import { textControls } from './controls.ts'
import { facesUsed, loadBrowserFonts, measureText, type LoadFonts } from './fonts.ts'
import { applyLayer, layerToObject, objectToLayer, resizeTextLayer, type MapperEnv, type TextEdge } from './mapper.ts'
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

/** What ended a logical modification. */
export type ChangeCause = 'transform' | 'text' | 'nudge'

/**
 * One logical modification by the human has ended: a move, resize or rotate is
 * released, a text edit is left with new text, or an arrow key nudged. Fired once
 * per modification, never for `load`.
 */
export type ChangeEvent = { document: Document; cause: ChangeCause; layerIds: string[] }

/** The selected Layers changed. Ids are bottom → top; empty when nothing is selected. */
export type SelectionEvent = { layerIds: string[] }

export type EditorEvents = { change: ChangeEvent; selection: SelectionEvent }

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
  /** The ids of the selected Layers, bottom → top. */
  getSelection(): string[]
  /** Subscribes to an editor event; returns the unsubscribe function. */
  on<K extends keyof EditorEvents>(type: K, listener: (event: EditorEvents[K]) => void): () => void
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

/** Arrow-key nudge in Document px; Shift multiplies it. */
const NUDGE = 1
const NUDGE_SHIFT = 10
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

export function createEditor({ loadFonts = loadBrowserFonts }: EditorOptions = {}): Editor {
  let canvas: Canvas | undefined
  let current: Document | undefined
  let entries: Entry[] = []
  let env: MapperEnv = { assetUrl: (src) => src, measure: measureText }
  let zoom = 1
  /** Bumped by every `load`, so only the latest one shows its Document. */
  let loads = 0
  let selected: string[] = []
  let unmount = () => {}
  const listeners: { [K in keyof EditorEvents]: Set<(event: EditorEvents[K]) => void> } = {
    change: new Set(),
    selection: new Set(),
  }

  const emit = <K extends keyof EditorEvents>(type: K, event: EditorEvents[K]) => {
    for (const listener of [...listeners[type]]) listener(event)
  }

  const requireCanvas = (): Canvas => {
    if (!canvas) throw new Error('Editor is not mounted; call mount(container) first')
    return canvas
  }

  const entryOf = (object: FabricObject) => entries.find((e) => e.object === object)

  const documentNow = (): Document => {
    if (!current) throw new Error('No Document loaded')
    return { ...structuredClone(current), layers: entries.map((e) => objectToLayer(e.object, e.base)) }
  }

  /** Ends a logical modification of `objects`: bakes each into its Layer and emits one `change`. */
  const commit = (objects: FabricObject[], cause: ChangeCause) => {
    const c = requireCanvas()
    const active = c.getActiveObject()
    // Inside an ActiveSelection an object's own props are relative to the selection, so
    // the selection is dissolved first (Fabric moves its transform onto the objects),
    // the objects are baked in the scene, and then they are selected again.
    const regroup = active instanceof ActiveSelection && objects.some((o) => o.group === active)
    if (regroup) c.discardActiveObject()
    const touched: Entry[] = []
    for (const object of objects) {
      const entry = entryOf(object)
      if (!entry) continue
      entry.base = objectToLayer(object, entry.base)
      applyLayer(object, entry.base, env)
      touched.push(entry)
    }
    if (regroup) c.setActiveObject(new ActiveSelection(objects, { canvas: c }))
    c.requestRenderAll()
    if (touched.length > 0) emit('change', { document: documentNow(), cause, layerIds: touched.map((e) => e.base.id) })
  }

  const reportSelection = () => {
    const c = requireCanvas()
    const ids = entries.filter((e) => c.getActiveObjects().includes(e.object)).map((e) => e.base.id)
    if (ids.length === selected.length && ids.every((id, i) => id === selected[i])) return
    selected = ids
    emit('selection', { layerIds: [...ids] })
  }

  /** Moves one edge of a text Layer's Box while its handle is dragged; committed on release. */
  const resizeText = (object: FabricObject, edge: TextEdge, point: Point) => {
    const entry = entryOf(object)
    if (!entry || entry.base.type !== 'text') return false
    const before = entry.base
    entry.base = resizeTextLayer(object, entry.base, edge, point)
    applyLayer(object, entry.base, env)
    return entry.base.width !== before.width || entry.base.height !== before.height
  }

  const nudge = (event: KeyboardEvent) => {
    const direction = ARROWS[event.key]
    if (!direction || !canvas || event.altKey || event.ctrlKey || event.metaKey) return
    const target = event.target as HTMLElement | null
    if (target?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return
    const active = canvas.getActiveObject()
    if (!active || (active instanceof Textbox && active.isEditing)) return
    event.preventDefault()
    const step = event.shiftKey ? NUDGE_SHIFT : NUDGE
    active.set({ left: active.left + direction[0] * step, top: active.top + direction[1] * step })
    active.setCoords()
    commit(canvas.getActiveObjects(), 'nudge')
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
      const c = new Canvas(element, { preserveObjectStacking: true })
      canvas = c
      c.on('object:modified', ({ target, transform }) => {
        // A text edit fires this without a transform; `text:editing:exited` commits it.
        if (!transform) return
        commit(target instanceof ActiveSelection ? target.getObjects() : [target], 'transform')
      })
      c.on('text:editing:exited', ({ target }) => {
        const entry = entryOf(target)
        if (!entry || entry.base.type !== 'text' || entry.base.text === target.text) return
        entry.base = { ...entry.base, text: target.text } satisfies TextLayer
        commit([target], 'text')
      })
      c.on('selection:created', reportSelection)
      c.on('selection:updated', reportSelection)
      c.on('selection:cleared', reportSelection)
      const keyTarget = container.ownerDocument
      keyTarget.addEventListener('keydown', nudge)
      unmount = () => keyTarget.removeEventListener('keydown', nudge)
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

      const nextEnv: MapperEnv = { assetUrl, measure: measureText }
      const objects = await Promise.all(next.layers.map((layer) => layerToObject(layer, nextEnv)))
      if (token !== loads || canvas !== c) return // a newer load (or destroy) won
      c.discardActiveObject()
      c.remove(...c.getObjects())
      current = next
      env = nextEnv
      entries = next.layers.map((layer, i) => ({ base: layer, object: objects[i]! }))
      for (const { object } of entries) if (object instanceof Textbox) object.controls = textControls(resizeText)
      c.backgroundColor = current.canvas.background ?? ''
      c.add(...entries.map((e) => e.object))
      applyZoom()
      c.renderAll()
    },

    getDocument: documentNow,

    getSelection: () => [...selected],

    on(type, listener) {
      listeners[type].add(listener)
      return () => listeners[type].delete(listener)
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
      unmount()
      unmount = () => {}
      canvas = undefined
      current = undefined
      entries = []
      selected = []
      listeners.change.clear()
      listeners.selection.clear()
      await c?.dispose()
    },
  }
}

export type { Size } from './zoom.ts'
