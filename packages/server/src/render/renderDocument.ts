import { boxTransform, type Document, type Layer, linearGradientLine, type RectLayer } from '@bannerkit/core'
import sharp, { type Sharp } from 'sharp'
import { Canvas, type CanvasRenderingContext2D } from 'skia-canvas'

export const RENDER_FORMATS = ['png', 'jpg', 'webp'] as const
export type RenderFormat = (typeof RENDER_FORMATS)[number]

export type RenderOptions = {
  /** Output scale relative to the Canvas size (1 or 2). Default 1. */
  scale?: number
  /** Default png. PNG keeps alpha; JPEG is flattened onto the Canvas background (white if null). */
  format?: RenderFormat
  /** JPEG/WebP quality 1-100. Default 90. Ignored for PNG, which is always lossless. */
  quality?: number
}

export const DEFAULT_QUALITY = 90

/** Every Render is drawn at 2 × scale and downsampled with Lanczos (ADR 0006). */
export const SUPERSAMPLE = 2

/**
 * Renders a Document to an encoded image at exactly `width × height × scale`.
 * Pure with respect to the filesystem; callers decide where bytes go.
 */
export async function renderDocument(doc: Document, options: RenderOptions = {}): Promise<Buffer> {
  const scale = options.scale ?? 1
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
  for (const layer of doc.layers) drawLayer(ctx, layer, drawScale)

  const raw = await canvas.toBuffer('raw', { colorType: 'rgba', premultiplied: false })
  const resized = sharp(raw, { raw: { width: canvas.width, height: canvas.height, channels: 4 } }).resize(
    width * scale,
    height * scale,
    { kernel: 'lanczos3', fit: 'fill' },
  )
  return encode(resized, options.format ?? 'png', options.quality ?? DEFAULT_QUALITY, background).toBuffer()
}

function encode(image: Sharp, format: RenderFormat, quality: number, background: string | null): Sharp {
  switch (format) {
    case 'png':
      // No quality/effort: either switches sharp to lossy palette PNG.
      return image.png()
    case 'jpg':
      return image.flatten({ background: background ?? '#ffffff' }).jpeg({ quality })
    case 'webp':
      return image.webp({ quality })
  }
}

/**
 * Draws one Layer with the effects every Layer type shares: visibility, opacity and shadow.
 * `drawScale` is the device pixels per Canvas pixel; shadows ignore the transform, so their
 * blur and offsets are scaled by hand.
 */
function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer, drawScale: number): void {
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
    default:
      // image and text Layers are drawn from tickets 05 and 06 on.
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
