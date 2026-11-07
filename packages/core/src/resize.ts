// Canvas resize with an Anchor. Pure, no DOM or Node APIs.
import { z } from 'zod'
import { CanvasSchema, type Document } from './document.ts'
import type { Size } from './presets.ts'
import { mapLayers } from './tree.ts'

/** A new Canvas size is checked by the same rules as the Document's own `canvas`. */
const CanvasSizeSchema = CanvasSchema.pick({ width: true, height: true })

/** The nine Anchor points, row by row from the top-left. */
export const ANCHORS = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const
export type Anchor = (typeof ANCHORS)[number]

export const AnchorSchema = z.enum(ANCHORS)

/** How far across (fx) and down (fy) the Canvas each Anchor sits: 0, ½ or 1. */
function anchorFractions(anchor: Anchor): { fx: number; fy: number } {
  const index = ANCHORS.indexOf(anchor)
  if (index < 0) throw new Error(`resizeCanvas: unknown Anchor "${anchor}"`)
  return { fx: (index % 3) / 2, fy: Math.floor(index / 3) / 2 }
}

/**
 * The Document with its Canvas resized to `size`, keeping the `anchor` point put.
 * Layers are never scaled: every Layer (and every Guide) moves by the same whole-pixel delta
 * `floor(f · (new − old))` per axis (so at a centre Anchor an odd extra pixel
 * goes to the right or bottom edge), and may end up partly or fully off the Canvas.
 * The same size returns the Document as is. Throws when `size` is outside the
 * Canvas limits (whole numbers from 1 to MAX_CANVAS_SIDE).
 */
export function resizeCanvas(document: Document, size: Size, anchor: Anchor = 'top-left'): Document {
  const { width, height } = CanvasSizeSchema.parse({ width: size.width, height: size.height })
  const { fx, fy } = anchorFractions(anchor)
  if (width === document.canvas.width && height === document.canvas.height) return document
  // `+ 0` turns a -0 from floor(-0) into 0.
  const dx = Math.floor(fx * (width - document.canvas.width)) + 0
  const dy = Math.floor(fy * (height - document.canvas.height)) + 0
  // Every Layer in the tree moves: Layers hold Canvas coordinates at every depth.
  const moved = mapLayers(document, (layer) => ({ ...layer, x: layer.x + dx, y: layer.y + dy }))
  // Guides stay where they were relative to the Layers.
  const guides = document.guides && { x: document.guides.x.map((x) => x + dx), y: document.guides.y.map((y) => y + dy) }
  return { ...moved, canvas: { ...document.canvas, width, height }, ...(guides && { guides }) }
}
