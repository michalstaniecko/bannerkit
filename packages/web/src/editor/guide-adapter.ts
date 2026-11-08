// Guides in the editor (ADR 0008): the Guide drag session (`drag`), the Guides' hit
// testing on the Canvas (`attachHits`), the Rulers a Guide is dropped on (`addRuler`)
// and the `guides` events. The pure edits and lookups are in guides.ts, the snapping in
// snapping/guide.ts; the editor (index.ts) owns the Gesture preview a drag runs in.
//
// A drag is a Gesture preview of `guides` only. Its value snaps onto Layers and the
// Canvas on whole px (Cmd/Ctrl or Snapping off: plain whole px); over a Ruler the Guide
// is shown removed. The release is one `guides` step; Escape, or any other step
// dropping the preview, cancels it.
import type { Document, MeasureText } from '@bannerkit/core'
import type { Canvas } from 'fabric'
import { guideAt, setGuide } from './guides.ts'
import { guideTargets, snapGuide } from './snapping/guide.ts'
import type { GuideMark, Mark } from './snapping/marks.ts'
import type { Axis } from './snapping/targets.ts'

/** Where a Guide gesture's pointer is: client px, with the keys held (a `MouseEvent` is one). */
export type GuidePointer = { clientX: number; clientY: number; metaKey?: boolean; ctrlKey?: boolean }

/**
 * A Guide being dragged (`dragGuide`). Each method resolves once the Canvas shows it;
 * after `end` or `cancel` (or Escape, or any other step dropping its preview) every
 * method does nothing.
 */
export type GuideDrag = {
  /** Moves the Guide under `pointer` (snapped unless Cmd/Ctrl or Snapping off); over a Ruler it is shown removed. */
  move(pointer: GuidePointer): Promise<void>
  /** Releases at `pointer`: one `guides` step (none without a move, or for a new Guide released over a Ruler). */
  end(pointer: GuidePointer): Promise<void>
  /** Shows the Guides from before the gesture again, without a step. */
  cancel(): Promise<void>
}

/** The Guide being dragged: `value` in Canvas px, undefined while it is over a Ruler (to be removed). */
export type DraggedGuide = { axis: Axis; index: number | 'new'; value: number | undefined }

/** The Guides shown changed (any step, preview or load), or the one being dragged did. */
export type GuidesEvent = { guides: { x: number[]; y: number[] }; dragging: DraggedGuide | null }

/** The editor's canvas: a Fabric canvas that tells whether a selection rectangle is being dragged out. */
export type GuideCanvas = Canvas & { readonly selecting: boolean }

/** The part of the editor's Gesture preview a Guide drag uses. */
export type GuidePreview = {
  show(recipe: (document: Document) => Document): Promise<void>
  commit(options: { cause: 'guides' }): Promise<void>
  cancel(): Promise<void>
  ended(): boolean
}

export type GuideAdapterEnv = {
  /** The mounted canvas (throws when not mounted). */
  canvas: () => GuideCanvas
  /** The Document shown now, if any. */
  document: () => Document | undefined
  /** The Document a new gesture starts from (before any running preview). */
  base: () => Document
  /** Drops any running preview and starts one of `base`. */
  startPreview: (base: Document) => GuidePreview
  /** Ends a text edit in progress. */
  finishTextEdit: () => void
  measure: () => MeasureText
  zoom: () => number
  snapping: () => boolean
  /** Redraws the canvas if one is still mounted. */
  requestRender: () => void
  emit: (event: GuidesEvent) => void
}

export type GuideAdapter = {
  /** Starts dragging the Guide `index` on `axis`, or a new one (`'new'`). */
  drag(axis: Axis, index: number | 'new'): GuideDrag
  /** Hooks the Guides' hover and press into the canvas `c`. Returns the detach function. */
  attachHits(c: GuideCanvas): () => void
  /** Registers a Ruler: a Guide released over `element` is removed. Returns the unregister function. */
  addRuler(element: Element): () => void
  /** The Guides as the overlay draws them, the hovered or dragged one lit up. */
  guideMarks(): GuideMark[]
  /** The snap lines of the running drag (none outside one). */
  marks(): Mark[]
  /** Sends a `guides` event when the Guides shown or the one dragged changed since the last one. */
  report(): void
  /** Ends the running drag if its preview was dropped. */
  settle(): void
  /** Forgets everything (the editor is destroyed). */
  reset(): void
}

/** How near a Guide the pointer hits it, in screen px. */
const GUIDE_HIT = 3

export function createGuideAdapter(env: GuideAdapterEnv): GuideAdapter {
  /** The Guide drag running, if any. */
  let guideDrag: { dragging: DraggedGuide; marks: Mark[]; settle: () => void } | undefined
  /** The Guide under the pointer on the Canvas (lit up). */
  let hoveredGuide: { axis: Axis; index: number } | undefined
  /** Elements a Guide released over is removed on (`addRuler`). */
  const rulers = new Set<Element>()
  /** The last `guides` event sent (as JSON). */
  let sentGuides: string | undefined

  const report = () => {
    const current = env.document()
    if (!current) return
    const event: GuidesEvent = { guides: { x: [...(current.guides?.x ?? [])], y: [...(current.guides?.y ?? [])] }, dragging: guideDrag ? { ...guideDrag.dragging } : null }
    const key = JSON.stringify(event)
    if (key === sentGuides) return
    sentGuides = key
    env.emit(event)
  }

  const guideMarks = (): GuideMark[] => {
    const current = env.document()
    const guides = current?.guides
    if (!current || !guides) return []
    const { width, height } = current.canvas
    const drag = guideDrag?.dragging
    const lit = (axis: Axis, index: number, count: number) =>
      (hoveredGuide?.axis === axis && hoveredGuide.index === index) ||
      (drag !== undefined && drag.value !== undefined && drag.axis === axis && (drag.index === 'new' ? index === count - 1 : drag.index === index))
    return (['x', 'y'] as const).flatMap((axis) =>
      guides[axis].map((at, index, all): GuideMark => ({ kind: 'guide', axis, at, from: 0, to: axis === 'x' ? height : width, active: lit(axis, index, all.length) })),
    )
  }

  /** Whether `pointer` is over a Ruler (`addRuler`). */
  const overRuler = ({ clientX, clientY }: GuidePointer) =>
    [...rulers].some((element) => {
      const r = element.getBoundingClientRect()
      return clientX >= r.left && clientX < r.right && clientY >= r.top && clientY < r.bottom
    })

  /** `pointer` in Canvas px. */
  const canvasPoint = ({ clientX, clientY }: GuidePointer) => {
    const r = env.canvas().lowerCanvasEl.getBoundingClientRect()
    const zoom = env.zoom()
    return { x: (clientX - r.left) / zoom, y: (clientY - r.top) / zoom }
  }

  const drag = (axis: Axis, index: number | 'new'): GuideDrag => {
    const c = env.canvas()
    if (!env.document()) throw new Error('No Document loaded')
    guideDrag?.settle()
    env.finishTextEdit()
    const base = env.base()
    const list = base.guides?.[axis] ?? []
    if (index !== 'new' && !(Number.isInteger(index) && index >= 0 && index < list.length)) throw new Error(`No Guide ${index} on ${axis}`)
    const preview = env.startPreview(base)
    const targets = guideTargets(base, env.measure())
    const keys = c.lowerCanvasEl.ownerDocument
    let moved = false
    let done = false
    const finish = () => {
      if (done) return
      done = true
      keys.removeEventListener('keydown', onKey)
      if (guideDrag === state) guideDrag = undefined
      report()
      env.requestRender()
    }
    const state = {
      dragging: { axis, index, value: index === 'new' ? undefined : list[index] } as DraggedGuide,
      marks: [] as Mark[],
      settle: () => {
        if (preview.ended()) finish()
      },
    }
    guideDrag = state
    const live = () => {
      if (!done && preview.ended()) finish()
      return !done
    }
    const cancel = async () => {
      if (!live()) return
      finish()
      await preview.cancel()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      void cancel()
    }
    keys.addEventListener('keydown', onKey)
    const move = (pointer: GuidePointer): Promise<void> => {
      if (!live()) return Promise.resolve()
      moved = true
      let value: number | undefined
      state.marks = []
      if (!overRuler(pointer)) {
        const raw = canvasPoint(pointer)[axis]
        if (!env.snapping() || pointer.metaKey || pointer.ctrlKey) value = Math.round(raw) || 0
        else ({ value, marks: state.marks } = snapGuide(targets, axis, raw, env.zoom()))
      }
      state.dragging.value = value
      report()
      c.requestRenderAll()
      return preview.show((d) => setGuide(d, axis, index, value))
    }
    return {
      move,
      async end(pointer) {
        if (!live()) return
        if (!moved) return cancel()
        await move(pointer)
        finish()
        await preview.commit({ cause: 'guides' })
      },
      cancel,
    }
  }

  /**
   * Guides on the Canvas: the pointer over one (within GUIDE_HIT screen px, not over a
   * handle of the active object, no gesture running) lights it up and shows a resize
   * cursor, and a press there drags it (`drag`) instead of reaching Fabric, so it
   * wins over the Layers below. Listens in the capture phase on Fabric's wrapper.
   */
  const attachHits = (c: GuideCanvas): (() => void) => {
    const wrapper = c.wrapperEl
    const page = wrapper.ownerDocument
    const under = (e: MouseEvent) => {
      const guides = env.document()?.guides
      if (!guides || guideDrag || c._currentTransform || c.selecting) return undefined
      const active = c.getActiveObject()
      if (active?.findControl(c.getViewportPoint(e))) return undefined
      return guideAt(guides, c.getScenePoint(e), GUIDE_HIT / env.zoom())
    }
    const hover = (hit: { axis: Axis; index: number } | undefined) => {
      if (hit?.axis === hoveredGuide?.axis && hit?.index === hoveredGuide?.index) return
      hoveredGuide = hit
      c.requestRenderAll()
    }
    const onMove = (e: MouseEvent) => {
      // With Alt held the pointer measures (measure-adapter.ts), so it passes Guides by.
      const hit = e.altKey ? undefined : under(e)
      hover(hit)
      if (!hit) return
      e.stopPropagation()
      c.upperCanvasEl.style.cursor = hit.axis === 'x' ? 'ew-resize' : 'ns-resize'
    }
    const onOut = () => hover(undefined)
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const hit = under(e)
      if (!hit) return
      e.stopPropagation()
      e.preventDefault()
      hover(undefined)
      const running = drag(hit.axis, hit.index)
      const move = (event: MouseEvent) => void running.move(event)
      const up = (event: MouseEvent) => {
        page.removeEventListener('mousemove', move)
        page.removeEventListener('mouseup', up)
        void running.end(event)
      }
      page.addEventListener('mousemove', move)
      page.addEventListener('mouseup', up)
    }
    wrapper.addEventListener('mousemove', onMove, true)
    wrapper.addEventListener('mousedown', onDown, true)
    wrapper.addEventListener('mouseout', onOut)
    return () => {
      wrapper.removeEventListener('mousemove', onMove, true)
      wrapper.removeEventListener('mousedown', onDown, true)
      wrapper.removeEventListener('mouseout', onOut)
    }
  }

  return {
    drag,
    attachHits,
    addRuler(element) {
      rulers.add(element)
      return () => rulers.delete(element)
    },
    guideMarks,
    marks: () => guideDrag?.marks ?? [],
    report,
    settle: () => guideDrag?.settle(),
    reset() {
      rulers.clear()
      guideDrag = undefined
      hoveredGuide = undefined
      sentGuides = undefined
    },
  }
}
