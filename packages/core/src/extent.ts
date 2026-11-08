// The Canvas-space extent of any Layer, Groups included. Pure, no DOM or Node APIs.
import type { Layer } from './document.ts'
import type { Rect } from './fit.ts'
import { boxExtent } from './geometry.ts'
import { layoutText, type MeasureText } from './textLayout.ts'

/**
 * The axis-aligned Canvas-space extent of a Layer. A leaf's is its (rotated)
 * Box, a text Layer without `height` taking the height of its Text Layout. A
 * Group's (its Box, ADR 0007) bounds the extents of all its children, hidden
 * ones and nested Groups included.
 */
export function layerExtent(layer: Layer, measure: MeasureText): Rect {
  switch (layer.type) {
    case 'group':
      return union(layer.layers.map((child) => layerExtent(child, measure)))
    case 'text':
      return boxExtent({ ...layer, height: layer.height ?? layoutText(layer, measure).height })
    default:
      return boxExtent(layer)
  }
}

/**
 * The Selection Box of `layers`: the axis-aligned union of their `layerExtent`s.
 * No Layers have no Selection Box.
 */
export function selectionBox(layers: readonly Layer[], measure: MeasureText): Rect | undefined {
  return layers.length === 0 ? undefined : union(layers.map((layer) => layerExtent(layer, measure)))
}

function union(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  const right = Math.max(...rects.map((r) => r.x + r.width))
  const bottom = Math.max(...rects.map((r) => r.y + r.height))
  return { x, y, width: right - x, height: bottom - y }
}
