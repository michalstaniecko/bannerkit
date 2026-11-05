import { boxTransform, type Document, type Layer, linearGradientLine, type RectLayer } from '@bannerkit/core'
import sharp from 'sharp'
import { Canvas, type CanvasRenderingContext2D } from 'skia-canvas'
import { drawImageLayer, type LayerImages, loadLayerImages } from './images.ts'

export type RenderFormat = 'png'

export type RenderOptions = {
  /** Output scale relative to the Canvas size (1 or 2). Default 1. */
  scale?: number
  format?: RenderFormat
  /** The Project directory that image Layer `src` paths are relative to. Required for image Layers. */
  projectDir?: string
}

/** Every Render is drawn at 2 × scale and downsampled with Lanczos (ADR 0006). */
export const SUPERSAMPLE = 2

/**
 * Renders a Document to an encoded image at exactly `width × height × scale`.
 * Reads Assets from `projectDir` but writes nothing; callers decide where bytes go.
 * Throws a RENDER_FAILED OpError naming the Layer and `src` when an Asset cannot be loaded.
 */
export async function renderDocument(doc: Document, options: RenderOptions = {}): Promise<Buffer> {
  const scale = options.scale ?? 1
  const images = await loadLayerImages(doc, options.projectDir)
  const { width, height, background } = doc.canvas
  const drawScale = scale * SUPERSAMPLE
  // CPU raster: the default GPU backend is not deterministic enough for snapshots.
  const canvas = new Canvas(width * drawScale, height * drawScale, { gpu: false })
  const ctx = canvas.getContext('2d')
  ctx.scale(drawScale, drawScale)

  if (background !== null) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  for (const layer of doc.layers) drawLayer(ctx, layer, drawScale, images)

  const raw = await canvas.toBuffer('raw', { colorType: 'rgba', premultiplied: false })
  return sharp(raw, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .resize(width * scale, height * scale, { kernel: 'lanczos3', fit: 'fill' })
    .png()
    .toBuffer()
}

/**
 * Draws one Layer with the effects every Layer type shares: visibility, opacity and shadow.
 * `drawScale` is the device pixels per Canvas pixel; shadows ignore the transform, so their
 * blur and offsets are scaled by hand.
 */
function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, drawScale: number, images: LayerImages): void {
  if (layer.visible === false) return
  ctx.save()
  ctx.globalAlpha = layer.opacity ?? 1
  if (layer.shadow) {
    ctx.shadowColor = layer.shadow.color
    ctx.shadowBlur = layer.shadow.blur * drawScale
    ctx.shadowOffsetX = layer.shadow.offsetX * drawScale
    ctx.shadowOffsetY = layer.shadow.offsetY * drawScale
  }
  switch (layer.type) {
    case 'rect':
      drawRect(ctx, layer)
      break
    case 'image':
      drawImageLayer(ctx, layer, images.get(layer.id)!, drawScale)
      break
    default:
      // text Layers are drawn from ticket 06 on.
      break
  }
  ctx.restore()
}

function drawRect(ctx: CanvasRenderingContext2D, layer: RectLayer): void {
  const { width, height, fill } = layer
  ctx.save()
  ctx.transform(...boxTransform(layer))
  if (typeof fill === 'string') {
    ctx.fillStyle = fill
  } else {
    const { x0, y0, x1, y1 } = linearGradientLine(fill.angle, width, height)
    const gradient = ctx.createLinearGradient(x0, y0, x1, y1)
    for (const [color, offset] of fill.stops) gradient.addColorStop(offset, color)
    ctx.fillStyle = gradient
  }
  const radius = Math.min(layer.cornerRadius ?? 0, width / 2, height / 2)
  if (radius > 0) {
    ctx.beginPath()
    ctx.roundRect(0, 0, width, height, radius)
    ctx.fill()
  } else {
    ctx.fillRect(0, 0, width, height)
  }
  ctx.restore()
}
