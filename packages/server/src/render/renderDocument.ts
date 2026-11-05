import type { Document, Layer } from '@bannerkit/core'
import sharp from 'sharp'
import { Canvas, type CanvasRenderingContext2D } from 'skia-canvas'

export type RenderFormat = 'png'

export type RenderOptions = {
  /** Output scale relative to the Canvas size (1 or 2). Default 1. */
  scale?: number
  format?: RenderFormat
}

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
  const canvas = new Canvas(width * drawScale, height * drawScale)
  const ctx = canvas.getContext('2d')
  ctx.scale(drawScale, drawScale)

  if (background !== null) {
    ctx.fillStyle = background
    ctx.fillRect(0, 0, width, height)
  }
  for (const layer of doc.layers) drawLayer(ctx, layer)

  const raw = await canvas.toBuffer('raw', { colorType: 'rgba', premultiplied: false })
  return sharp(raw, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .resize(width * scale, height * scale, { kernel: 'lanczos3', fit: 'fill' })
    .png()
    .toBuffer()
}

function drawLayer(ctx: CanvasRenderingContext2D, layer: Layer): void {
  switch (layer.type) {
    case 'rect':
      ctx.fillStyle = layer.fill
      ctx.fillRect(layer.x, layer.y, layer.width, layer.height)
      return
  }
}
