// Gradient and rotation geometry shared by both renderers. Pure math, no DOM or Node APIs.

/** A gradient line from (x0, y0) at stop 0 to (x1, y1) at stop 1, in Box-relative pixels. */
export type GradientLine = { x0: number; y0: number; x1: number; y1: number }

/**
 * The gradient line of a CSS `linear-gradient(<angle>deg, ...)` over a `width × height` Box,
 * relative to the Box top-left. 0 = to top, 90 = to right. The line passes through the Box
 * centre and is long enough that the corners land exactly on stops 0 and 1, as in CSS.
 */
export function linearGradientLine(angle: number, width: number, height: number): GradientLine {
  const rad = (angle * Math.PI) / 180
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2
  const cx = width / 2
  const cy = height / 2
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half }
}

/** A Layer's Box: `x`/`y` are the top-left of the unrotated Box, `rotation` is degrees around its centre. */
export type Box = { x: number; y: number; width: number; height: number; rotation?: number }

/** A 2D affine matrix `[a, b, c, d, e, f]` in the Canvas 2D `setTransform` / DOMMatrix order. */
export type Matrix = [number, number, number, number, number, number]

export function boxCenter(box: Box): { x: number; y: number } {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Maps Box-local coordinates (0,0 = top-left of the unrotated Box) to Canvas coordinates,
 * rotating clockwise by `rotation` degrees around the Box centre.
 */
export function boxTransform(box: Box): Matrix {
  const rad = ((box.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const c = boxCenter(box)
  const hw = box.width / 2
  const hh = box.height / 2
  // translate(centre) · rotate · translate(-half size)
  return [cos, sin, -sin, cos, c.x - cos * hw + sin * hh, c.y - sin * hw - cos * hh]
}

/** Applies a Matrix to a point. */
export function applyMatrix(m: Matrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}
