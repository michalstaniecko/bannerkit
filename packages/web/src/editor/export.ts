// Browser Export (ADR 0006), the editor's counterpart of the server's `renderDocument`:
// the Fabric scene is drawn offscreen at 2 × scale *relative to the logical Canvas
// size* (never the screen's `devicePixelRatio`, never the editor zoom), downsampled
// to exactly `width × height × scale`, then encoded. PNG and WebP keep alpha; JPEG is
// flattened onto the Canvas background, white if it is transparent.
import {
  DEFAULT_EXPORT_QUALITY,
  EXPORT_MIME,
  SUPERSAMPLE,
  isExportFormat,
  isExportScale,
  type Document,
  type ExportFormat,
  type ExportScale,
} from '@bannerkit/core'
import { FabricImage, type StaticCanvas } from 'fabric'

export type ExportOptions = {
  /** Default png. */
  format?: ExportFormat
  /** Output scale relative to the Canvas size. Default 1. */
  scale?: ExportScale
  /** JPEG/WebP quality 1-100, like the server. Default 90. Ignored for PNG. */
  quality?: number
}

export type ExportResult = { blob: Blob; width: number; height: number; format: ExportFormat; scale: ExportScale }

/**
 * Exports what `canvas` shows of a Document whose Canvas is `size`. The caller has
 * loaded the Document's fonts; every image is decoded here before drawing.
 */
export async function exportCanvas(
  canvas: StaticCanvas,
  size: Document['canvas'],
  { format = 'png', scale = 1, quality = DEFAULT_EXPORT_QUALITY }: ExportOptions = {},
): Promise<ExportResult> {
  if (!isExportFormat(format)) throw new Error(`Unknown Export format "${format}"`)
  if (!isExportScale(scale)) throw new Error(`Export scale must be 1 or 2, got ${scale}`)
  if (!(quality >= 1 && quality <= 100)) throw new Error(`Export quality must be 1-100, got ${quality}`)

  await Promise.all(
    canvas
      .getObjects()
      .filter((o): o is FabricImage => o instanceof FabricImage)
      .map((image) => {
        const element = image.getElement()
        return element instanceof HTMLImageElement ? element.decode() : undefined
      }),
  )

  const { width, height, background } = size
  const supersampled = drawLogical(canvas, width, height, scale * SUPERSAMPLE)

  const out = globalThis.document.createElement('canvas')
  out.width = width * scale
  out.height = height * scale
  const ctx = out.getContext('2d')!
  if (format === 'jpg') {
    ctx.fillStyle = background ?? '#ffffff'
    ctx.fillRect(0, 0, out.width, out.height)
  }
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(supersampled, 0, 0, out.width, out.height)

  const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, EXPORT_MIME[format], quality / 100))
  if (!blob || blob.type !== EXPORT_MIME[format]) throw new Error(`This browser cannot encode ${format}`)
  return { blob, width: out.width, height: out.height, format, scale }
}

/**
 * The scene at `multiplier` device px per Canvas px. Fabric's `toCanvasElement` (what
 * `toDataURL({ multiplier })` draws with) multiplies the current viewport zoom, so the
 * viewport is reset to identity for the draw: the output is then exactly
 * `width × height × multiplier` and the shown zoom never leaks into an Export.
 * Retina scaling is off inside `toCanvasElement`, so `devicePixelRatio` never applies.
 *
 * Object caching is off for the draw too: a cached object is rasterised into its own
 * canvas and blitted at a fractional offset, a second resample that blurs edges and
 * shifts them by a fraction of a pixel (measured: up to ~1% of pixels off the server).
 */
function drawLogical(canvas: StaticCanvas, width: number, height: number, multiplier: number): HTMLCanvasElement {
  const viewport = canvas.viewportTransform
  const objects = canvas.getObjects()
  const caching = objects.map((o) => o.objectCaching)
  canvas.viewportTransform = [1, 0, 0, 1, 0, 0]
  for (const o of objects) o.objectCaching = false
  try {
    return canvas.toCanvasElement(multiplier, { left: 0, top: 0, width, height })
  } finally {
    objects.forEach((o, i) => (o.objectCaching = caching[i]!))
    canvas.viewportTransform = viewport
    canvas.calcViewportBoundaries()
  }
}
