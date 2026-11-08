// Image Layers for the server renderer: loads every Asset a Document references up
// front (drawing is synchronous), then draws each one into its Box by Fit.
import { readFile } from 'node:fs/promises'
import { extname, isAbsolute, join } from 'node:path'
import { boxTransform, type Document, fitImage, type ImageLayer, type Rect, type Size, svgIntrinsicSize, walkLayers } from '@bannerkit/core'
import { Canvas, type CanvasRenderingContext2D, type Image, loadImage } from 'skia-canvas'
import { OpError } from '../ops/errors.ts'

/** A decoded Asset plus the intrinsic size Fit math uses (for SVG, parsed from the file, not skia's guess). */
export type LoadedImage = { image: Image; size: Size; svg: boolean }

/** Layer id → decoded Asset. */
export type LayerImages = Map<string, LoadedImage>

/**
 * Loads the Asset of every image Layer, resolving `src` against `projectDir`. Any failure
 * (no projectDir, missing file, undecodable data) is a RENDER_FAILED OpError naming the Layer
 * id and `src`, located at the Layer's `src` path (`layers[i].src`).
 */
export async function loadLayerImages(doc: Document, projectDir: string | undefined): Promise<LayerImages> {
  const images: LayerImages = new Map()
  for (const { layer, path } of walkLayers(doc)) {
    if (layer.type !== 'image') continue
    try {
      images.set(layer.id, await loadAsset(layer.src, projectDir))
    } catch (error) {
      const reason = (error as Error).message
      const message = `image Layer "${layer.id}" could not load src "${layer.src}": ${reason}`
      throw new OpError('RENDER_FAILED', message, [{ path: `${path}.src`, message }])
    }
  }
  return images
}

async function loadAsset(src: string, projectDir: string | undefined): Promise<LoadedImage> {
  if (projectDir === undefined) throw new Error('no Project directory to resolve it against')
  // The same rule as the src-exists validation: project-relative, no `..` segments.
  if (isAbsolute(src) || /^[A-Za-z]:/.test(src) || src.split(/[\\/]/).includes('..')) {
    throw new Error('src must be a project-relative path inside the Project')
  }
  const data = await readFile(join(projectDir, src)).catch((error: NodeJS.ErrnoException) => {
    throw new Error(error.code === 'ENOENT' ? 'file not found' : error.message)
  })
  const image = await loadImage(data)
  if (extname(src).toLowerCase() === '.svg') {
    const size = svgIntrinsicSize(data.toString('utf8')) ?? { width: image.width, height: image.height }
    return { image, size, svg: true }
  }
  return { image, size: { width: image.width, height: image.height }, svg: false }
}

/**
 * Draws an image Layer into its rotated Box. Fit never places pixels outside the Box (cover
 * crops the source instead of clipping), so shadows follow the visible image.
 */
export function drawImageLayer(
  ctx: CanvasRenderingContext2D,
  layer: ImageLayer,
  loaded: LoadedImage,
  drawScale: number,
): void {
  const { source, dest } = fitImage(layer.fit, layer, loaded.size)
  if (dest.width <= 0 || dest.height <= 0) return
  ctx.save()
  ctx.transform(...boxTransform(layer))
  if (loaded.svg) {
    // skia-canvas ignores the source rect for SVG images, so rasterise the visible part at
    // device resolution first, drawing the SVG with an explicit size (never its bogus default).
    const raster = rasteriseSvg(loaded, source, dest, drawScale)
    ctx.drawImage(raster, 0, 0, raster.width, raster.height, dest.x, dest.y, dest.width, dest.height)
  } else {
    ctx.drawImage(loaded.image, source.x, source.y, source.width, source.height, dest.x, dest.y, dest.width, dest.height)
  }
  ctx.restore()
}

function rasteriseSvg({ image, size }: LoadedImage, source: Rect, dest: Rect, drawScale: number): Canvas {
  const canvas = new Canvas(Math.ceil(dest.width * drawScale), Math.ceil(dest.height * drawScale), { gpu: false })
  const ctx = canvas.getContext('2d')
  // Device pixels per intrinsic SVG unit, per axis.
  const kx = canvas.width / source.width
  const ky = canvas.height / source.height
  ctx.drawImage(image, -source.x * kx, -source.y * ky, size.width * kx, size.height * ky)
  return canvas
}
