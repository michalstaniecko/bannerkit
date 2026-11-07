// Handles for text Layers and Groups.
//
// A text Layer has no corner handles and no top handle: the side handles move one
// side of its Box (only `width` changes) and the bottom handle moves the bottom
// (only `height` changes). Glyphs are never stretched: the editor re-lays the text
// out at the new Box on every move, instead of scaling it.
//
// A Group (and a Selection holding one) has corner handles that always scale
// proportionally and the rotation handle; the editor bakes the scale or rotation
// into its Layers (core `scaleGroup` / `rotateGroup`) when the handle is released.
import { Control, Point, controlsUtils, type FabricObject, type TransformActionHandler } from 'fabric'
import type { TextEdge } from './mapper.ts'

/** Moves `edge` of `target`'s Box to `point` (scene px); returns whether anything changed. */
export type ResizeText = (target: FabricObject, edge: TextEdge, point: Point) => boolean

export function textControls(resize: ResizeText): Record<string, Control> {
  const handle = (edge: TextEdge, x: number, y: number) =>
    new Control({
      x,
      y,
      actionName: 'resizing',
      cursorStyleHandler: controlsUtils.scaleCursorStyleHandler,
      actionHandler: (_event, transform, px, py) => resize(transform.target, edge, new Point(px, py)),
    })
  return {
    ml: handle('left', -0.5, 0),
    mr: handle('right', 0.5, 0),
    mb: handle('bottom', 0, 0.5),
    mtr: controlsUtils.createObjectDefaultControls().mtr,
  }
}

/** Proportional corner handles and the rotation handle; no edge handles. */
export function groupControls(): Record<string, Control> {
  const { tl, tr, bl, br, mtr } = controlsUtils.createObjectDefaultControls()
  const corners = { tl: tl!, tr: tr!, bl: bl!, br: br! }
  for (const corner of Object.values(corners)) corner.actionHandler = scaleProportionally
  return { ...corners, mtr: mtr! }
}

/** Fabric's corner scaling, proportional whether or not the uniform-scaling key (Shift) is held. */
const scaleProportionally: TransformActionHandler = (event, transform, x, y) => {
  const canvas = transform.target.canvas
  if (!canvas) return controlsUtils.scalingEqually(event, transform, x, y)
  const uniform = canvas.uniformScaling
  // Fabric scales proportionally when exactly one of `uniformScaling` and the key is on.
  const keyHeld = Boolean(canvas.uniScaleKey && event[canvas.uniScaleKey])
  canvas.uniformScaling = !keyHeld
  try {
    return controlsUtils.scalingEqually(event, transform, x, y)
  } finally {
    canvas.uniformScaling = uniform
  }
}
