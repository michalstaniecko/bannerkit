// The editor module: framework-agnostic, owns one fabric.Canvas. React (or anything
// else) renders chrome around it and talks to it only through `Editor`; Fabric
// objects never leave this module as state.
//
// Model: `load` keeps the Document and lays each Layer out as one Fabric object,
// bottom → top, in a parallel `Entry` tree (scene.ts): a Group is one DocumentGroup
// holding its children's objects (group.ts). `getDocument` rebuilds the Document from
// the objects via the mapper, so whatever Fabric shows is what you get back.
//
// A Group is selected and moved as a whole: a click on any of its Layers takes the
// top-level Group (the Canvas only ever targets top-level objects; `DocumentCanvas`
// hits a Group only where one of its Layers is hit). Moving it moves every Layer in it
// by the same delta, and the Group is laid out again around them. Ctrl/Cmd+G and
// Ctrl/Cmd+Shift+G group and ungroup the Selection (layer-actions.ts), one step each.
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
// A different Canvas size left by a step, an undo/redo, a reload or a `load` is also
// reported once as a `canvas` event (never during a preview), so Fit mode can zoom again.
//
// `export` renders the shown Canvas offscreen (export.ts).
import { faceKey, layerExtent, layoutText, walkLayers, type Document, type LeafLayer, type MeasureText, type TextLayer, type TextLayout } from '@bannerkit/core'
import { ActiveSelection, Canvas, Point, Textbox, type FabricObject } from 'fabric'
import { textControls } from './controls.ts'
import { facesUsed, loadBrowserFonts, measureText, type LoadFonts } from './fonts.ts'
import { exportCanvas, type ExportOptions, type ExportResult } from './export.ts'
import { createHistory } from './history.ts'
import { groupSelection, ungroupSelection, type LayerActionResult } from '../layer-actions.ts'
import { roundAngle, roundPx } from './rounding.ts'
import { DocumentGroup } from './group.ts'
import { applyLayer, isFrozen, layerToObject, objectToLayer, resizeTextLayer, type MapperEnv, type TextEdge } from './mapper.ts'
import { allEntries, buildEntries, isGroupEntry, layerOf, leavesOf, rebase, rootOf, sameShape, syncBase, type Entry, type GroupEntry } from './scene.ts'
import { fitZoom, type Size } from './zoom.ts'

export type EditorOptions = {
  /**
   * Loads the fonts a Document uses before any text is created. Defaults to the
   * browser loader (`@font-face` from the font manifest + `document.fonts.load`);
   * tests without a FontFaceSet inject their own.
   */
  loadFonts?: LoadFonts
  /**
   * Measures text for its Text Layout (what the Canvas draws and `textLayout` gives).
   * Defaults to the browser's canvas `measureText`; tests inject a deterministic one.
   */
  measure?: MeasureText
}

export type LoadOptions = {
  /** The URL an image Layer's project-relative `src` loads from. Defaults to `src` itself. */
  assetUrl?: (src: string) => string
}

/** What ended a direct manipulation. */
export type ManipulationCause = 'transform' | 'text' | 'nudge'

/**
 * An action that replaces the whole Document through `apply` or `update`; `resize`
 * is a change of the Canvas size (Inspector fields, Canvas resize handles).
 */
export type ApplyCause = 'layers' | 'json' | 'reload' | 'inspector' | 'resize'

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
 * A Gesture preview (not a Preview Render): a transient change of the shown Document while a gesture runs (dragging a field's
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

/**
 * The Canvas size shown changed: by a step (a resize, its undo or redo), a reload from
 * disk or a `load`. Fired once per such change, never while a preview runs (only when
 * it is committed), so Fit mode can zoom to the new size and stays put during a gesture.
 */
export type CanvasEvent = Size

export type EditorEvents = { change: ChangeEvent; selection: SelectionEvent; canvas: CanvasEvent }

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
  /**
   * The Text Layout of `layer` (its lines, height and the font size used after
   * AutoFit), from core `layoutText` with the measure the Canvas draws with (ADR 0004),
   * never read back from Fabric.
   */
  textLayout(layer: TextLayer): TextLayout
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

/** Whether two Documents are the same (as JSON: same keys, in the same order). */
const sameDocument = (a: Document, b: Document): boolean => JSON.stringify(a) === JSON.stringify(b)

/** Ids of the Layers that differ between two Documents, in `after` order then removed ones. */
function changedLayerIds(before: Document, after: Document): string[] {
  const all = (document: Document) => walkLayers(document).map((v) => v.layer)
  const old = new Map(all(before).map((l) => [l.id, JSON.stringify(l)]))
  const ids = all(after).filter((l) => old.get(l.id) !== JSON.stringify(l)).map((l) => l.id)
  const kept = new Set(all(after).map((l) => l.id))
  return [...ids, ...all(before).filter((l) => !kept.has(l.id)).map((l) => l.id)]
}

export function createEditor({ loadFonts = loadBrowserFonts, measure = measureText }: EditorOptions = {}): Editor {
  let canvas: Canvas | undefined
  let current: Document | undefined
  /** The top-level Layers' Entries, bottom → top (scene.ts). */
  let roots: Entry[] = []
  let env: MapperEnv = { assetUrl: (src) => src, measure }
  let zoom = 1
  /** Bumped by every `load`, so only the latest one shows its Document. */
  let loads = 0
  let selected: string[] = []
  /** While true, Fabric's selection events are not reported (the editor reselects what it dissolved). */
  let holdSelection = false
  const history = createHistory()
  /** The preview running, if any; `drop` ends it and shows the Document from before it again. */
  let previewing: { base: Document; drop: () => Promise<void>; end: () => void } | undefined
  /** Undoes `mount` and returns the <canvas> it added to the container. */
  let unmount = (): HTMLCanvasElement | undefined => undefined
  const listeners: { [K in keyof EditorEvents]: Set<(event: EditorEvents[K]) => void> } = {
    change: new Set(),
    selection: new Set(),
    canvas: new Set(),
  }
  /** The Canvas size last reported by a `canvas` event. */
  let settledSize: Size | undefined

  const emit = <K extends keyof EditorEvents>(type: K, event: EditorEvents[K]) => {
    for (const listener of [...listeners[type]]) listener(event)
  }

  /** Reports the shown Canvas size when it differs from the one last reported (see `CanvasEvent`). */
  const settleSize = () => {
    if (!current) return
    const { width, height } = current.canvas
    if (settledSize && settledSize.width === width && settledSize.height === height) return
    settledSize = { width, height }
    emit('canvas', { width, height })
  }

  const requireCanvas = (): Canvas => {
    if (!canvas) throw new Error('Editor is not mounted; call mount(container) first')
    return canvas
  }

  const entryOf = (object: FabricObject) => allEntries(roots).find((e) => e.object === object)

  const documentNow = (): Document => {
    if (!current) throw new Error('No Document loaded')
    return { ...structuredClone(current), layers: roots.map(layerOf) }
  }

  /**
   * Bakes a move of a Group's object into its Layers: every leaf in it moves by the
   * delta of the Group's centre from its Box centre (whole px for a drag, like any
   * transform), so they all move alike. The Group is laid out again by the caller.
   */
  const bakeGroupMove = (entry: GroupEntry, cause: ChangeCause) => {
    const box = layerExtent(syncBase(entry), env.measure)
    const centre = new Point(0, 0).transform(entry.object.calcTransformMatrix())
    let dx = centre.x - (box.x + box.width / 2)
    let dy = centre.y - (box.y + box.height / 2)
    if (cause === 'transform') [dx, dy] = [roundPx(dx), roundPx(dy)]
    if (dx === 0 && dy === 0) return
    for (const leaf of leavesOf(entry)) leaf.base = { ...leaf.base, x: leaf.base.x + dx, y: leaf.base.y + dy }
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
      if (isGroupEntry(entry)) bakeGroupMove(entry, cause)
      else {
        const layer = objectToLayer(object, entry.base)
        entry.base = cause === 'transform' ? wholePixels(layer) : layer
      }
      touched.push(entry)
    }
    // Lay out each top-level Layer touched again, so a Group's Box follows its Layers.
    for (const root of new Set(touched.map(rootOf))) applyLayer(root.object, syncBase(root), env)
    if (regroup) c.setActiveObject(new ActiveSelection(objects, { canvas: c }))
    c.requestRenderAll()
    if (touched.length === 0) return
    const document = documentNow()
    history.record(document)
    const ids = new Set(touched.flatMap((e) => allEntries([e]).map((d) => d.base.id)))
    emit('change', { document, cause, layerIds: [...ids] })
  }

  /**
   * Lays `document` out in place of what is shown, once its fonts and Assets have
   * loaded. Resolves false when a newer `show` (or `destroy`) won meanwhile.
   */
  const show = async (document: Document, nextEnv: MapperEnv): Promise<boolean> => {
    const c = requireCanvas()
    const token = ++loads
    const next = structuredClone(document)
    const layers = next.layers
    // Fonts first: text is laid out (AutoFit, wrapping) only with the real font.
    await loadFonts(facesUsed(next))
    if (token !== loads || canvas !== c) return false
    // Fabric caches glyph widths per family; anything still shown is re-measured.
    for (const object of c.getObjects()) if (object instanceof Textbox) object.initDimensions()
    c.requestRenderAll()

    const objects = await Promise.all(layers.map((layer) => layerToObject(layer, nextEnv)))
    if (token !== loads || canvas !== c) return false // a newer show (or destroy) won
    c.discardActiveObject()
    c.remove(...c.getObjects())
    current = next
    env = nextEnv
    roots = buildEntries(layers, objects)
    for (const { object } of allEntries(roots)) if (object instanceof Textbox) object.controls = textControls(resizeText)
    c.backgroundColor = current.canvas.background ?? ''
    c.add(...roots.map((e) => e.object))
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
    settleSize()
    return true
  }

  /**
   * Shows `next` keeping the Selection. When every Layer keeps its id, type and `src`
   * (in the same order, in the same Groups) each is laid out again on its own object; otherwise the
   * Document is shown afresh and the same Layers selected again. Resolves false when
   * a newer `show` (or `destroy`) won meanwhile.
   */
  const relayout = async (next: Document): Promise<boolean> => {
    const c = requireCanvas()
    const ids = [...selected]
    const inPlace = sameShape(roots, next.layers)
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
        const entry = roots[i]!
        rebase(entry, layer)
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
    const objects = allEntries(roots).filter((e) => ids.includes(e.base.id)).map((e) => e.object)
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

  /**
   * Starts a preview of `base` once `ready` (a dropped preview's restore) settles:
   * its shows queue behind `ready`, so they never race that restore.
   */
  const startPreview = (base: Document, ready: Promise<unknown>): Preview => {
    let ended = false
    let shows = 0
    let pending: Promise<unknown> = ready
    const end = () => {
      ended = true
      if (previewing === state) previewing = undefined
    }
    const restore = async () => {
      if (ended) return
      end()
      // Synchronous when laid out in place, so a step right after starts from `base`.
      if (current && !sameDocument(documentNow(), base)) await relayout(base)
    }
    const state = { base, drop: restore, end }
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
        if (sameDocument(after, base)) return
        history.record(after)
        emit('change', { document: after, cause, layerIds: changedLayerIds(base, after) })
        settleSize()
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
    return allEntries(roots).some((e) => isFrozen(e.base) && active.includes(e.object))
  }

  const reportSelection = () => {
    const active = canvas?.getActiveObject()
    if (active instanceof ActiveSelection) {
      const frozen = selectionFrozen()
      active.set({ hasControls: !frozen, lockMovementX: frozen, lockMovementY: frozen })
    }
    if (holdSelection) return
    const c = requireCanvas()
    const ids = allEntries(roots).filter((e) => c.getActiveObjects().includes(e.object)).map((e) => e.base.id)
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
    if (entry.parent) applyLayer(rootOf(entry).object, syncBase(rootOf(entry)), env)
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

  /**
   * Ctrl/Cmd+G groups the Selection, Ctrl/Cmd+Shift+G ungroups every selected Group
   * (layer-actions.ts): one step, then the result is selected. The browser's own
   * shortcut is blocked even when the action is unavailable.
   */
  const groupKeys = (event: KeyboardEvent): boolean => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== 'g') return false
    event.preventDefault()
    const result = (event.shiftKey ? ungroupSelection : groupSelection)(documentNow(), selected)
    if (result) void applyLayers(result)
    return true
  }

  /** Shows a Layer action's Document as one 'layers' step, then selects its result. */
  const applyLayers = async ({ document, select }: LayerActionResult) => {
    finishTextEdit()
    await dropPreview()
    if (await showStep(document, 'layers')) selectIds(select)
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!canvas || !current) return
    const target = event.target as HTMLElement | null
    if (target?.closest?.(FIELD)) return
    // A gesture is previewing; its owner handles keys (Escape cancels it).
    if (previewing) return
    if (undoKeys(event)) return
    if (groupKeys(event)) return
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
      const c = new DocumentCanvas(element, { preserveObjectStacking: true })
      canvas = c
      c.on('object:modified', ({ target, transform }) => {
        // A text edit fires this without a transform; `text:editing:exited` commits it.
        if (!transform) return
        commit(target instanceof ActiveSelection ? target.getObjects() : [target], 'transform')
      })
      c.on('text:editing:exited', ({ target }) => {
        const entry = entryOf(target)
        if (!entry || entry.base.type !== 'text') return
        if (entry.base.text === target.text) {
          // Unchanged: show the Layer again (its textTransform hides the typed text).
          applyLayer(target, entry.base, env)
          c.requestRenderAll()
          return
        }
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
      if (!(await show(document, { assetUrl, measure }))) return
      history.reset(document)
      settleSize()
    },

    getDocument: documentNow,

    async apply(document, { cause }) {
      if (!current) throw new Error('No Document loaded')
      finishTextEdit()
      await dropPreview()
      if (sameDocument(document, documentNow())) return
      await showStep(document, cause)
    },

    async update(recipe, { cause }) {
      if (!current) throw new Error('No Document loaded')
      finishTextEdit()
      await dropPreview()
      let before = documentNow()
      let next = recipe(structuredClone(before))
      // A font not shown yet loads first; the recipe then runs on whatever shows by then.
      if (!sameFaces(before, next)) {
        const token = loads
        await loadFonts(facesUsed(next))
        if (token !== loads || !current) return
        before = documentNow()
        next = recipe(structuredClone(before))
      }
      if (sameDocument(next, before)) return
      if (!(await relayout(next))) return
      const after = documentNow()
      history.record(after)
      emit('change', { document: after, cause, layerIds: changedLayerIds(before, after) })
      settleSize()
    },

    preview() {
      if (!current) throw new Error('No Document loaded')
      finishTextEdit()
      // A dropped preview that changed the Layers restores asynchronously, so what
      // shows now is not yet the Document from before it: start from that one instead.
      const base = previewing?.base ?? documentNow()
      return startPreview(base, dropPreview())
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

    textLayout: (layer) => layoutText(layer, measure),

    objectFor(layerId) {
      return allEntries(roots).find((e) => e.base.id === layerId)?.object
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
      roots = []
      selected = []
      listeners.change.clear()
      listeners.selection.clear()
      listeners.canvas.clear()
      settledSize = undefined
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
  const shown = new Set(facesUsed(before).map(faceKey))
  return facesUsed(next).every((f) => shown.has(faceKey(f)))
}

/**
 * The editor's Fabric canvas. A Group is hit only where one of its Layers is (shown and
 * not locked), never on the empty parts of its Box; a locked or hidden Group not at all.
 */
class DocumentCanvas extends Canvas {
  override _checkTarget(object: FabricObject, pointer: Point): boolean {
    if (!(object instanceof DocumentGroup)) return super._checkTarget(object, pointer)
    return object.visible && object.evented && object.getObjects().some((child) => this._checkTarget(child, pointer))
  }
}

/**
 * A drag, resize or rotate lands on whole pixels (`x`, `y`, `width`, `height`) and
 * a rotation of 0.1°, so the human's edits stay readable in the JSON. Nudges move
 * by whole pixels already and keep whatever the Layer had.
 */
function wholePixels(layer: LeafLayer): LeafLayer {
  const rounded: LeafLayer = { ...layer, x: roundPx(layer.x), y: roundPx(layer.y), width: roundPx(layer.width) }
  if ('height' in layer && layer.height !== undefined) (rounded as { height: number }).height = roundPx(layer.height)
  if (layer.rotation !== undefined) rounded.rotation = roundAngle(layer.rotation)
  return rounded
}
