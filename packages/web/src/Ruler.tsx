// A Ruler: a <canvas> in a gutter of the Canvas area (top: axis x, left: axis y) with a
// scale in Canvas px whose step follows the zoom (Snapping module `rulerTicks`), over
// the whole visible stretch of the viewport, also before and beyond the Canvas. It
// highlights the span of the Selection Box from the editor's `selectionBox` event, live
// during a gesture. Without an open Document it is empty.
//
// The viewport scrolls with CSS (no Fabric `viewportTransform`, no panning), so Canvas →
// screen is `× zoom` plus where the Canvas host element is on screen: a Ruler px `p`
// shows Canvas px `(p − origin) / zoom`, `origin` being the host's edge relative to the
// Ruler (`getBoundingClientRect`). It is computed again on scroll, zoom, a `canvas`
// event, and when the viewport, the host or the Ruler resizes, at most once a frame.
//
// The buffer is sized in device px (`devicePixelRatio`) and ticks sit on whole device
// px, so it stays sharp. What a draw labelled is kept in `data-labels` ("value@px",
// px along the Ruler in CSS px), for tests and anything lining up with the Ruler.
import type { Rect } from '@bannerkit/core'
import { useEffect, useRef, type RefObject } from 'react'
import type { Editor } from './editor/index.ts'
import { rulerTicks } from './editor/snapping/ruler.ts'

export type RulerAxis = 'x' | 'y'

type Props = {
  axis: RulerAxis
  editor: RefObject<Editor | null>
  loaded: boolean
  /** The scrolling viewport (scroll and resize redraw). */
  viewportRef: RefObject<HTMLElement | null>
  /** The element the Fabric canvas sits in at Canvas px 0, 0. */
  hostRef: RefObject<HTMLElement | null>
  /** Redraws when it changes (the editor's zoom is read at draw time). */
  zoom: number
}

/** Length of a minor tick and of a labelled one, as a share of the Ruler's thickness. */
const MINOR_TICK = 0.25
const LABEL_TICK = 1
/** Label text: CSS px from its tick and from the Ruler's outer edge. */
const LABEL_INSET = 3

/** Where Canvas px 0 is along a Ruler, in CSS px from its start, and the zoom (Canvas → screen). */
export type RulerMapping = { origin: number; zoom: number }

/** The mapping for a Ruler at `ruler` (screen rect) and the Canvas host at `host`. */
export function rulerMapping(axis: RulerAxis, ruler: DOMRect, host: DOMRect, zoom: number): RulerMapping {
  return { origin: axis === 'x' ? host.left - ruler.left : host.top - ruler.top, zoom }
}

export function Ruler({ axis, editor, loaded, viewportRef, hostRef, zoom }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boxRef = useRef<Rect | null>(null)
  /** Draws again on the next frame (once, however often it is called). */
  const scheduleRef = useRef<() => void>(() => {})

  useEffect(() => {
    const ruler = canvasRef.current!
    const viewport = viewportRef.current
    const host = hostRef.current
    const view = ruler.ownerDocument.defaultView!
    const current = loaded ? editor.current : null
    boxRef.current = null
    let frame = 0
    const draw = () => {
      frame = 0
      const shown = current && host ? rulerMapping(axis, ruler.getBoundingClientRect(), host.getBoundingClientRect(), current.getZoom()) : undefined
      drawRuler(ruler, axis, view.devicePixelRatio || 1, shown, boxRef.current)
    }
    const schedule = () => {
      if (!frame) frame = view.requestAnimationFrame(draw)
    }
    scheduleRef.current = schedule
    const offs = current
      ? [
          current.on('selectionBox', ({ box }) => {
            boxRef.current = box
            schedule()
          }),
          current.on('canvas', schedule),
        ]
      : []
    viewport?.addEventListener('scroll', schedule, { passive: true })
    view.addEventListener('resize', schedule)
    const observer = new ResizeObserver(schedule)
    for (const element of [ruler, viewport, host]) if (element) observer.observe(element)
    schedule()
    return () => {
      for (const off of offs) off()
      viewport?.removeEventListener('scroll', schedule)
      view.removeEventListener('resize', schedule)
      observer.disconnect()
      if (frame) view.cancelAnimationFrame(frame)
      scheduleRef.current = () => {}
    }
  }, [axis, editor, loaded, viewportRef, hostRef])

  useEffect(() => scheduleRef.current(), [zoom])

  return <canvas ref={canvasRef} className="ruler" data-axis={axis} aria-hidden="true" />
}

/** Draws the Ruler: background, Selection Box span, ticks and labels; only the background without a mapping. */
function drawRuler(ruler: HTMLCanvasElement, axis: RulerAxis, dpr: number, mapping: RulerMapping | undefined, box: Rect | null) {
  const { clientWidth, clientHeight } = ruler
  const width = Math.round(clientWidth * dpr)
  const height = Math.round(clientHeight * dpr)
  if (ruler.width !== width) ruler.width = width
  if (ruler.height !== height) ruler.height = height
  const ctx = ruler.getContext('2d')
  if (!ctx) return
  const style = getComputedStyle(ruler)
  const color = (name: string) => style.getPropertyValue(name).trim()
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = color('--ruler-surface')
  ctx.fillRect(0, 0, width, height)
  if (!mapping || !(mapping.zoom > 0)) {
    ruler.dataset.labels = ''
    return
  }

  // Work along the Ruler (`along`, device px) and across it from its outer edge (`across`).
  const length = axis === 'x' ? width : height
  const thickness = axis === 'x' ? height : width
  if (axis === 'y') ctx.setTransform(0, 1, 1, 0, 0, 0) // swap x and y: along ↓, across →
  const { origin, zoom } = mapping
  const toDevice = (value: number) => Math.round((origin + value * zoom) * dpr)

  if (box) {
    const [start, end] = axis === 'x' ? [box.x, box.x + box.width] : [box.y, box.y + box.height]
    ctx.fillStyle = color('--ruler-highlight')
    ctx.fillRect(toDevice(start), 0, Math.max(1, toDevice(end) - toDevice(start)), thickness)
  }

  // From 100 screen px before the start, so a label whose tick is just off the Ruler still shows its text.
  const from = -origin / zoom - 100 / zoom
  const to = (length / dpr - origin) / zoom
  const fontSize = parseFloat(color('--ruler-text-size')) || 10
  ctx.font = `${fontSize * dpr}px ${style.fontFamily}`
  ctx.textBaseline = 'top'
  const labels: string[] = []
  for (const tick of rulerTicks(from, to, zoom)) {
    const at = toDevice(tick.value)
    const size = Math.max(1, Math.round(thickness * (tick.label ? LABEL_TICK : MINOR_TICK)))
    ctx.fillStyle = color('--ruler-tick')
    ctx.fillRect(at, thickness - size, Math.max(1, Math.round(dpr)), size)
    if (!tick.label) continue
    labels.push(`${tick.value}@${Math.round((at / dpr) * 100) / 100}`)
    ctx.fillStyle = color('--ruler-text')
    const text = String(tick.value)
    if (axis === 'x') ctx.fillText(text, at + LABEL_INSET * dpr, LABEL_INSET * dpr)
    else drawVerticalLabel(ctx, text, at, dpr)
  }
  ruler.dataset.labels = labels.join(' ')
}

/** A label on the left Ruler, read bottom to top, ending just above its tick. */
function drawVerticalLabel(ctx: CanvasRenderingContext2D, text: string, at: number, dpr: number) {
  ctx.save()
  // Back to screen axes (x across, y along), then turn a quarter anticlockwise.
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.translate(LABEL_INSET * dpr, at - LABEL_INSET * dpr)
  ctx.rotate(-Math.PI / 2)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}
