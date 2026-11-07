// The precision overlay (ADR 0008): the editor draws Marks (snapping/marks.ts) on
// Fabric's top context, `contextTop`, which neither the Render nor an Export
// (`toCanvasElement`) ever touches. The pattern is Fabric's AligningGuidelines: clear
// what it drew on `before:render`, draw on `after:render` (also fired by `renderTop`),
// in screen px with 1 px lines whatever the zoom.
//
// Colours are CSS tokens read from the editor's container at `mount` (`--snap`, `--measure`, …).
// A new Mark kind adds its colour to `OverlayColors` and a case to `drawMark`.
import type { Canvas } from 'fabric'
import type { Mark, MeasureMark } from './snapping/marks.ts'

export type OverlayColors = { snap: string; measure: string }

/** Used when the container's stylesheet has no token (tests, a host page without tokens.css). */
const FALLBACK: OverlayColors = { snap: '#f24822', measure: '#f24822' }

/** Reads the overlay's colour tokens from `container`'s computed style. */
export function readOverlayColors(container: HTMLElement): OverlayColors {
  const style = container.ownerDocument.defaultView?.getComputedStyle(container)
  const token = (name: string, fallback: string) => style?.getPropertyValue(name).trim() || fallback
  return { snap: token('--snap', FALLBACK.snap), measure: token('--measure', FALLBACK.measure) }
}

/**
 * Draws `marks()` over `canvas` on every render until the returned function detaches it.
 * `zoom()` maps Canvas px to screen px.
 */
export function attachOverlay(canvas: Canvas, marks: () => readonly Mark[], zoom: () => number, colors: OverlayColors): () => void {
  let drawn = false
  const clear = () => {
    if (!drawn) return
    canvas.clearContext(canvas.contextTop)
    drawn = false
  }
  const draw = () => {
    const shown = marks()
    if (shown.length === 0) return
    const ctx = canvas.contextTop
    const retina = canvas.getRetinaScaling()
    ctx.save()
    ctx.setTransform(retina, 0, 0, retina, 0, 0)
    for (const mark of shown) drawMark(ctx, mark, zoom(), colors)
    ctx.restore()
    drawn = true
  }
  const offBefore = canvas.on('before:render', clear)
  const offAfter = canvas.on('after:render', draw)
  return () => {
    offBefore()
    offAfter()
    clear()
  }
}

/** A Canvas coordinate as the centre of a 1 screen-px line, so it stays crisp. */
const crisp = (value: number, zoom: number) => Math.round(value * zoom) + 0.5

function drawMark(ctx: CanvasRenderingContext2D, mark: Mark, zoom: number, colors: OverlayColors): void {
  switch (mark.kind) {
    case 'snap-line': {
      ctx.strokeStyle = colors.snap
      ctx.lineWidth = 1
      ctx.beginPath()
      const at = crisp(mark.at, zoom)
      if (mark.axis === 'x') {
        ctx.moveTo(at, mark.from * zoom)
        ctx.lineTo(at, mark.to * zoom)
      } else {
        ctx.moveTo(mark.from * zoom, at)
        ctx.lineTo(mark.to * zoom, at)
      }
      ctx.stroke()
      return
    }
    case 'measure-box': {
      ctx.strokeStyle = colors.measure
      ctx.lineWidth = 1
      const { x, y, width, height } = mark.rect
      const left = crisp(x, zoom)
      const top = crisp(y, zoom)
      ctx.strokeRect(left, top, crisp(x + width, zoom) - left, crisp(y + height, zoom) - top)
      return
    }
    case 'measure':
      drawMeasure(ctx, mark, zoom, colors.measure)
      return
  }
}

/** Half the length of the ticks across both ends of a Measurement distance, in screen px. */
const TICK = 3

/** A Measurement distance: a 1 px line with ticks at its ends, its dashed extension and its label in a pill. */
function drawMeasure(ctx: CanvasRenderingContext2D, mark: MeasureMark, zoom: number, color: string): void {
  // In screen px, `u` along the distance and `v` across it.
  const point = (u: number, v: number): [number, number] => (mark.axis === 'x' ? [u, v] : [v, u])
  const line = (u1: number, v1: number, u2: number, v2: number) => {
    ctx.moveTo(...point(u1, v1))
    ctx.lineTo(...point(u2, v2))
  }
  const at = crisp(mark.at, zoom)
  const from = crisp(mark.from, zoom)
  const to = crisp(mark.to, zoom)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()
  line(from, at, to, at)
  line(from, at - TICK, from, at + TICK)
  line(to, at - TICK, to, at + TICK)
  ctx.stroke()
  if (mark.extension) {
    const e = mark.extension
    ctx.save()
    ctx.setLineDash([4, 3])
    ctx.beginPath()
    line(crisp(e.at, zoom), crisp(e.from, zoom), crisp(e.at, zoom), crisp(e.to, zoom))
    ctx.stroke()
    ctx.restore()
  }
  ctx.font = '11px system-ui, sans-serif'
  const width = ctx.measureText(mark.label).width + 8
  const height = 16
  const [cx, cy] = point((from + to) / 2, at)
  ctx.fillStyle = color
  ctx.fillRect(Math.round(cx - width / 2), Math.round(cy - height / 2), Math.round(width), height)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(mark.label, cx, cy)
}
