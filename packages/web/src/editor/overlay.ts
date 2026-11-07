// The precision overlay (ADR 0008): the editor draws Marks (snapping/marks.ts) on
// Fabric's top context, `contextTop`, which neither the Render nor an Export
// (`toCanvasElement`) ever touches. The pattern is Fabric's AligningGuidelines: clear
// what it drew on `before:render`, draw on `after:render` (also fired by `renderTop`),
// in screen px with 1 px lines whatever the zoom.
//
// Colours are CSS tokens read from the editor's container at `mount` (`--snap`, …).
// A new Mark kind adds its colour to `OverlayColors` and a case to `drawMark`.
import type { Canvas } from 'fabric'
import type { GapMark, Mark } from './snapping/marks.ts'

export type OverlayColors = { snap: string }

/** Used when the container's stylesheet has no token (tests, a host page without tokens.css). */
const FALLBACK: OverlayColors = { snap: '#f24822' }

/** Reads the overlay's colour tokens from `container`'s computed style. */
export function readOverlayColors(container: HTMLElement): OverlayColors {
  const style = container.ownerDocument.defaultView?.getComputedStyle(container)
  const token = (name: string, fallback: string) => style?.getPropertyValue(name).trim() || fallback
  return { snap: token('--snap', FALLBACK.snap) }
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
    case 'gap':
      drawGap(ctx, mark, zoom, colors)
      return
  }
}

/** Half the length of the ticks closing a gap, in screen px. */
const GAP_TICK = 4

/** An equal gap: a segment closed by ticks, its px label beside its middle. */
function drawGap(ctx: CanvasRenderingContext2D, mark: GapMark, zoom: number, colors: OverlayColors): void {
  const at = crisp(mark.at, zoom)
  const from = mark.from * zoom
  const to = mark.to * zoom
  // Along the gap's axis (u) and across it (v), whichever way the gap runs.
  const point = (u: number, v: number): [number, number] => (mark.axis === 'x' ? [u, v] : [v, u])
  ctx.strokeStyle = colors.snap
  ctx.fillStyle = colors.snap
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(...point(from, at))
  ctx.lineTo(...point(to, at))
  for (const end of [crisp(mark.from, zoom), crisp(mark.to, zoom)]) {
    ctx.moveTo(...point(end, at - GAP_TICK))
    ctx.lineTo(...point(end, at + GAP_TICK))
  }
  ctx.stroke()
  ctx.font = '11px sans-serif'
  ctx.textAlign = mark.axis === 'x' ? 'center' : 'left'
  ctx.textBaseline = mark.axis === 'x' ? 'bottom' : 'middle'
  ctx.fillText(mark.label, ...point((from + to) / 2, mark.axis === 'x' ? at - GAP_TICK - 2 : at + GAP_TICK + 2))
}
