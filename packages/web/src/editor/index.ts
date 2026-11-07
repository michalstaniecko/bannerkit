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
// exactly one `change` event carries the new Document. Autosave and anything else
// that follows edits hang on `change`.
//
// Undo (history.ts): every step ends with a Document snapshot. A direct
// manipulation records one when it is committed; any other action that replaces
// the Document (Layer list actions, JSON apply, reload from disk) goes through
// `apply(document, { cause })`, which shows it and records exactly one step.
// The Inspector and reloads from disk use `update(recipe, { cause })` instead: also
// one step, but the Selection stays and unchanged Layers are laid out in place.
// `undo` / `redo` show a snapshot again and emit `change` like any other edit, so
// autosave follows them. `load` starts a fresh history.
//
// A gesture that changes a value continuously (dragging a field's label, a Canvas
// resize handle) runs as a transient `preview()`: shown in place, no step, no
// `change`; its `commit` is the one step. Any other step drops it first.
//
// Later tickets extend this file: Layer list actions (14), JSON apply (15),
// reload from disk (16) and Selection sent to the server (17); `export` (18)
// renders the shown Canvas offscreen (export.ts).
import type { Document, Layer, TextLayer } from '@bannerkit/core'
import { ActiveSelection, Canvas, Textbox, type FabricObject, type Point } from 'fabric'
import { textControls } from './controls.ts'
import { facesUsed, loadBrowserFonts, measureText, type LoadFonts } from './fonts.ts'
import { exportCanvas, type ExportOptions, type ExportResult } from './export.ts'
import { createHistory } from './history.ts'
import { roundAngle, roundPx } from './rounding.ts'
import { applyLayer, isFrozen, layerToObject, objectToLayer, resizeTextLayer, type MapperEnv, type TextEdge } from './mapper.ts'
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

/** What ended a direct manipulation. */
export type ManipulationCause = 'transform' | 'text' | 'nudge'

/** An action that replaces the whole Document through `apply` or `update`. */
export type ApplyCause = 'layers' | 'json' | 'reload' | 'inspector'

/** What made one undo step (or moved through the history). */
export type ChangeCause = ManipulationCause | ApplyCause | 'undo' | 'redo'

/**
 * The shown Document changed by one step: a move, resize or rotate is released, a
 * text edit is left with new text, an arrow key nudged, an `apply`, an `undo` or a
 * `redo`. Fired once per step, never for `load`. `layerIds` are the Layers that
 * changed, appeared or disappeared.
 */
export type ChangeEvent = { document: Document; cause: ChangeCause; layerIds: string[] }

export type ApplyOptions = { cause: ApplyCause }

/** A pure edit of the Document: gets a copy of the shown one, returns the next one (already valid). */
export type DocumentRecipe = (document: Document) => Document

/**
 * A transient change of the shown Document while a gesture runs (dragging a field's
 * label, a Canvas resize handle): shown on the Canvas with the Selection kept, but no
 * undo step, no `change` and so no autosave. It ends with exactly one of `commit`,
 * `cancel`, or being dropped by any other step (an edit, undo/redo, a reload from
 * disk, `load`, another preview), which shows the Document from before it again.
 * Once ended, every method does nothing.
 */
export type Preview = {
  /**
   * Shows `recipe` applied to the Document from before the gesture (not to the
   * previous preview). Resolves once it shows.
   */
  show(recipe: DocumentRecipe): Promise<void>
  /** Makes what is shown one undo step and one `change` with `cause` (nothing when it equals the start). */
  commit(options: ApplyOptions): Promise<void>
  /** Shows the Document from before the gesture again, without a step. */
  cancel(): Promise<void>
  /** Whether it ended (committed, cancelled or dropped). */
  ended(): boolean
}

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
  /**
   * Shows `document` (already valid) in place of the current one, keeping the
   * Asset URLs of `load`, records it as one undo step and emits one `change`.
   * Resolves once it shows; does nothing when it equals the shown Document.
   */
  apply(document: Document, options: ApplyOptions): Promise<void>
  /**
   * Changes the shown Document by `recipe` (the Inspector's edits): one undo step and
   * one `change`, like `apply`, but the Selection stays and every Layer that keeps its
   * id, type and `src` is laid out again in place, so images are not loaded again.
   * Resolves once it shows; does nothing when the recipe changes nothing.
   */
  update(recipe: DocumentRecipe, options: ApplyOptions): Promise<void>
  /**
   * Starts a transient preview (see `Preview`) of the Document as shown now, ending a
   * text edit and dropping any preview already running.
   */
  preview(): Preview
  /** Steps back one undo step (ending a text edit first). Resolves false when there is none. */
  undo(): Promise<boolean>
  /** Steps forward one undone step. Resolves false when there is none. */
  redo(): Promise<boolean>
  canUndo(): boolean
  canRedo(): boolean
  /** The ids of the selected Layers, bottom → top. */
  getSelection(): string[]
  /**
   * Selects the Layers `ids` (none for `[]`), skipping unknown ones. Locked and hidden
   * Layers are selected too (the Layer list picks them for the Inspector), but on the
   * Canvas they have no handles and do not move.
   */
  select(ids: readonly string[]): void
  /** Subscribes to an editor event; returns the unsubscribe function. */
  on<K extends keyof EditorEvents>(type: K, listener: (event: EditorEvents[K]) => void): () => void
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

/** Arrow-key nudge in Document px; Shift multiplies it. */
const NUDGE = 1
const NUDGE_SHIFT = 10
const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Keys typed into these go to the field, not the editor. */
const FIELD = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]'

/** Ids of the Layers that differ between two Documents, in `after` order then removed ones. */
function changedLayerIds(before: Document, after: Document): string[] {
  const old = new Map(before.layers.map((l) => [l.id, JSON.stringify(l)]))
  const ids = after.layers.filter((l) => old.get(l.id) !== JSON.stringify(l)).map((l) => l.id)
  const kept = new Set(after.layers.map((l) => l.id))
  return [...ids, ...before.layers.filter((l) => !kept.has(l.id)).map((l) => l.id)]
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
  /** While true, Fabric's selection events are not reported (the editor reselects what it dissolved). */
  let holdSelection = false
  const history = createHistory()
  /** The preview running, if any; `drop` ends it and shows the Document from before it again. */
  let previewing: { drop: () => Promise<void>; end: () => void } | undefined
  /** Undoes `mount` and returns the <canvas> it added to the container. */
  let unmount = (): HTMLCanvasElement | undefined => undefined
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
      const layer = objectToLayer(object, entry.base)
      entry.base = cause === 'transform' ? wholePixels(layer) : layer
      applyLayer(object, entry.base, env)
      touched.push(entry)
    }
    if (regroup) c.setActiveObject(new ActiveSelection(objects, { canvas: c }))
    c.requestRenderAll()
    if (touched.length === 0) return
    const document = documentNow()
    history.record(document)
    emit('change', { document, cause, layerIds: touched.map((e) => e.base.id) })
  }

  /**
   * Lays `document` out in place of what is shown, once its fonts and Assets have
   * loaded. Resolves false when a newer `show` (or `destroy`) won meanwhile.
   */
  const show = async (document: Document, nextEnv: MapperEnv): Promise<boolean> => {
    const c = requireCanvas()
    const token = ++loads
    const next = structuredClone(document)
    // Fonts first: text is laid out (AutoFit, wrapping) only with the real font.
    await loadFonts(facesUsed(next))
    if (token !== loads || canvas !== c) return false
    // Fabric caches glyph widths per family; anything still shown is re-measured.
    for (const object of c.getObjects()) if (object instanceof Textbox) object.initDimensions()
    c.requestRenderAll()

    const objects = await Promise.all(next.layers.map((layer) => layerToObject(layer, nextEnv)))
    if (token !== loads || canvas !== c) return false // a newer show (or destroy) won
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
    return true
  }

  /** Shows `document` as a step taken by `cause` (recording it unless it is a history move), and emits it. */
  const showStep = async (document: Document, cause: ChangeCause): Promise<boolean> => {
    const before = documentNow()
    if (!(await show(document, env))) return false
    const after = documentNow()
    if (cause !== 'undo' && cause !== 'redo') history.record(after)
    emit('change', { document: after, cause, layerIds: changedLayerIds(before, after) })
    return true
  }

  /**
   * Shows `next` keeping the Selection. When every Layer keeps its id, type and `src`
   * (in the same order) each is laid out again on its own object; otherwise the
   * Document is shown afresh and the same Layers selected again. Resolves false when
   * a newer `show` (or `destroy`) won meanwhile.
   */
  const relayout = async (next: Document): Promise<boolean> => {
    const c = requireCanvas()
    const ids = [...selected]
    const inPlace =
      entries.length === next.layers.length && next.layers.every((layer, i) => sameObject(entries[i]!.base, layer))
    holdSelection = true
    try {
      if (!inPlace) {
        if (!(await show(next, env))) return false
        selectIds(ids)
        return true
      }
      // Inside an ActiveSelection an object's props are relative to it: dissolve, lay out, regroup.
      const active = c.getActiveObject()
      const group = active instanceof ActiveSelection ? active.getObjects() : undefined
      if (group) c.discardActiveObject()
      current = structuredClone(next)
      current.layers.forEach((layer, i) => {
        const entry = entries[i]!
        entry.base = layer
        applyLayer(entry.object, layer, env)
      })
      c.backgroundColor = current.canvas.background ?? ''
      if (group) c.setActiveObject(new ActiveSelection(group, { canvas: c }))
      applyZoom()
      return true
    } finally {
      holdSelection = false
      reportSelection()
    }
  }

  /** Selects the Layers `ids`, locked and hidden ones too, skipping unknown ones. */
  const selectIds = (ids: readonly string[]) => {
    const c = requireCanvas()
    const objects = entries.filter((e) => ids.includes(e.base.id)).map((e) => e.object)
    const held = holdSelection
    holdSelection = true // one report for the whole swap, not a `[]` in between
    try {
      c.discardActiveObject()
      if (objects.length === 1) c.setActiveObject(objects[0]!)
      else if (objects.length > 1) c.setActiveObject(new ActiveSelection(objects, { canvas: c }))
    } finally {
      holdSelection = held
    }
    c.requestRenderAll()
    reportSelection()
  }

  /** Ends a text edit in progress, so it becomes its own step before anything else. */
  const finishTextEdit = () => {
    const active = canvas?.getActiveObject()
    if (active instanceof Textbox && active.isEditing) active.exitEditing()
  }

  /** Drops a preview in progress, so any other step starts from the Document before it. */
  const dropPreview = async () => {
    await previewing?.drop()
  }

  const startPreview = (): Preview => {
    const base = documentNow()
    let ended = false
    let shows = 0
    let pending: Promise<unknown> = Promise.resolve()
    const end = () => {
      ended = true
      if (previewing === state) previewing = undefined
    }
    const restore = async () => {
      if (ended) return
      end()
      // Synchronous when laid out in place, so a step right after starts from `base`.
      if (current && JSON.stringify(documentNow()) !== JSON.stringify(base)) await relayout(base)
    }
    const state = { drop: restore, end }
    previewing = state

    const showNow = async (recipe: DocumentRecipe, token: number) => {
      const next = recipe(structuredClone(base))
      if (!sameFaces(base, next)) {
        await loadFonts(facesUsed(next))
        if (ended || token !== shows || !current) return
      }
      await relayout(next)
    }

    return {
      show(recipe) {
        if (ended) return Promise.resolve()
        const token = ++shows
        const shown = pending.then(() => (ended || token !== shows ? undefined : showNow(recipe, token)))
        pending = shown
        return shown
      },
      async commit({ cause }) {
        if (ended) return
        end()
        await pending
        if (!current) return
        const after = documentNow()
        if (JSON.stringify(after) === JSON.stringify(base)) return
        history.record(after)
        emit('change', { document: after, cause, layerIds: changedLayerIds(base, after) })
      },
      cancel: restore,
      ended: () => ended,
    }
  }

  const travel = async (direction: 'undo' | 'redo'): Promise<boolean> => {
    if (!current) return false
    finishTextEdit()
    await dropPreview()
    const snapshot = direction === 'undo' ? history.undo() : history.redo()
    if (!snapshot) return false
    return showStep(snapshot, direction)
  }

  /** Whether the Selection holds a locked or hidden Layer, so it shows no handles and does not move. */
  const selectionFrozen = (): boolean => {
    const active = canvas?.getActiveObjects() ?? []
    return entries.some((e) => isFrozen(e.base) && active.includes(e.object))
  }

  const reportSelection = () => {
    const active = canvas?.getActiveObject()
    if (active instanceof ActiveSelection) {
      const frozen = selectionFrozen()
      active.set({ hasControls: !frozen, lockMovementX: frozen, lockMovementY: frozen })
    }
    if (holdSelection) return
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

  /** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl+Y redo. */
  const undoKeys = (event: KeyboardEvent): boolean => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return false
    const key = event.key.toLowerCase()
    const direction = key === 'z' ? (event.shiftKey ? 'redo' : 'undo') : key === 'y' && !event.shiftKey ? 'redo' : undefined
    if (!direction) return false
    event.preventDefault()
    void travel(direction)
    return true
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!canvas || !current) return
    const target = event.target as HTMLElement | null
    if (target?.closest?.(FIELD)) return
    // A gesture is previewing; its owner handles keys (Escape cancels it).
    if (previewing) return
    if (undoKeys(event)) return
    nudge(event)
  }

  const nudge = (event: KeyboardEvent) => {
    const direction = ARROWS[event.key]
    if (!direction || !canvas || event.altKey || event.ctrlKey || event.metaKey) return
    const active = canvas.getActiveObject()
    if (!active || (active instanceof Textbox && active.isEditing) || selectionFrozen()) return
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
      keyTarget.addEventListener('keydown', onKeyDown)
      unmount = () => {
        keyTarget.removeEventListener('keydown', onKeyDown)
        return element
      }
    },

    async load(document, { assetUrl = (src: string) => src } = {}) {
      previewing?.end()
      if (await show(document, { assetUrl, measure: measureText })) history.reset(document)
    },

    getDocument: documentNow,

    async apply(document, { cause }) {
      if (!current) throw new Error('No Document loaded')
      finishTextEdit()
      await dropPreview()
      if (JSON.stringify(document) === JSON.stringify(documentNow())) return
      await showStep(document, cause)
    },

    async update(recipe, { cause }) {
      if (!current) throw new Error('No Document loaded')
      finishTextEdit()
      await dropPreview()
      let before = documentNow()
      let next = recipe(structuredClone(before))
      // A font not shown yet loads first; the recipe then runs on whatever shows by then.
      const shown = new Set(facesUsed(before).map((f) => `${f.family} ${f.weight}`))
      if (facesUsed(next).some((f) => !shown.has(`${f.family} ${f.weight}`))) {
        const token = loads
        await loadFonts(facesUsed(next))
        if (token !== loads || !current) return
        before = documentNow()
        next = recipe(structuredClone(before))
      }
      if (JSON.stringify(next) === JSON.stringify(before)) return
      if (!(await relayout(next))) return
      const after = documentNow()
      history.record(after)
      emit('change', { document: after, cause, layerIds: changedLayerIds(before, after) })
    },

    preview() {
      if (!current) throw new Error('No Document loaded')
      finishTextEdit()
      void dropPreview()
      return startPreview()
    },

    undo: () => travel('undo'),
    redo: () => travel('redo'),
    canUndo: () => current !== undefined && history.canUndo(),
    canRedo: () => current !== undefined && history.canRedo(),

    getSelection: () => [...selected],

    select(ids) {
      requireCanvas()
      finishTextEdit()
      selectIds(ids)
    },

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

    async export(options) {
      const c = requireCanvas()
      if (!current) throw new Error('No Document loaded')
      const document = this.getDocument()
      await loadFonts(facesUsed(document))
      return exportCanvas(c, document.canvas, options)
    },

    async destroy() {
      const c = canvas
      const mounted = unmount()
      unmount = () => undefined
      previewing?.end()
      canvas = undefined
      current = undefined
      entries = []
      selected = []
      listeners.change.clear()
      listeners.selection.clear()
      await c?.dispose()
      // Fabric's dispose puts the bare <canvas> back into the container; take it out too.
      mounted?.remove()
    },
  }
}

export type { Size } from './zoom.ts'
export type { ExportOptions, ExportResult } from './export.ts'

/** Whether `next` uses no font face that `before` does not (so nothing has to load first). */
function sameFaces(before: Document, next: Document): boolean {
  const shown = new Set(facesUsed(before).map((f) => `${f.family} ${f.weight}`))
  return facesUsed(next).every((f) => shown.has(`${f.family} ${f.weight}`))
}

/** Whether `next` can be laid out on the object made for `base`: same id and type, and same image `src`. */
function sameObject(base: Layer, next: Layer): boolean {
  if (base.id !== next.id || base.type !== next.type) return false
  return base.type !== 'image' || base.src === (next as typeof base).src
}

/**
 * A drag, resize or rotate lands on whole pixels (`x`, `y`, `width`, `height`) and
 * a rotation of 0.1°, so the human's edits stay readable in the JSON. Nudges move
 * by whole pixels already and keep whatever the Layer had.
 */
function wholePixels(layer: Layer): Layer {
  const rounded: Layer = { ...layer, x: roundPx(layer.x), y: roundPx(layer.y), width: roundPx(layer.width) }
  if ('height' in layer && layer.height !== undefined) (rounded as { height: number }).height = roundPx(layer.height)
  if (layer.rotation !== undefined) rounded.rotation = roundAngle(layer.rotation)
  return rounded
}
