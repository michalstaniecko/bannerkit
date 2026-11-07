// The precision overlay (ADR 0008): the editor draws Marks (snapping/marks.ts) on
// Fabric's top context, `contextTop`, which neither the Render nor an Export
// (`toCanvasElement`) ever touches. The pattern is Fabric's AligningGuidelines: clear
// what it drew on `before:render`, draw on `after:render` (also fired by `renderTop`),
// in screen px with 1 px lines whatever the zoom.
//
// Colours are CSS tokens read from the editor's container at `mount` (`--snap`, …).
// A new Mark kind adds its colour to `OverlayColors` and a case to `drawMark`.
import type { Canvas } from 'fabric'
import type { Mark } from './snapping/marks.ts'

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
  }
}
