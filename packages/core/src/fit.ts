// Fit geometry shared by both renderers. Pure math, no DOM or Node APIs.
import type { Fit } from './document.ts'
import type { Size } from './presets.ts'

export type Rect = { x: number; y: number; width: number; height: number }

/**
 * Where an image goes in its Box: the `source` rect of the image (in intrinsic pixels) is
 * drawn into the `dest` rect (Box-relative, 0,0 = Box top-left). This is the 9-argument
 * `drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)`; in Fabric terms `source` is the crop
 * and `dest.width / source.width` the scale.
 */
export type FitPlacement = { source: Rect; dest: Rect }

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 }

/**
 * Fits an image of `image` intrinsic size into a Box:
 * - `contain` shows the whole image, scaled to fit and centred (letterboxed);
 * - `cover` fills the Box, scaled to fill and cropped around the image centre;
 * - `stretch` maps the whole image onto the whole Box, ignoring aspect ratio.
 * Nothing ever lands outside the Box, so no clipping is needed.
 */
export function fitImage(fit: Fit, box: Size, image: Size): FitPlacement {
  const whole: Rect = { x: 0, y: 0, width: image.width, height: image.height }
  if (image.width <= 0 || image.height <= 0) return { source: whole, dest: EMPTY }
  if (fit === 'stretch') return { source: whole, dest: { x: 0, y: 0, width: box.width, height: box.height } }

  const sx = box.width / image.width
  const sy = box.height / image.height
  if (fit === 'contain') {
    const scale = Math.min(sx, sy)
    const width = image.width * scale
    const height = image.height * scale
    return { source: whole, dest: { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height } }
  }
  const scale = Math.max(sx, sy)
  const width = box.width / scale
  const height = box.height / scale
  return {
    source: { x: (image.width - width) / 2, y: (image.height - height) / 2, width, height },
    dest: { x: 0, y: 0, width: box.width, height: box.height },
  }
}
