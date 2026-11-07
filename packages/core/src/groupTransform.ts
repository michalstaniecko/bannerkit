// Scaling and rotating a Group as a whole (Document v2, ADR 0007). A Group has no
// transform of its own: its children hold Canvas coordinates, so a scale or a
// rotation of the Group is baked into every Layer in it, nested ones too. Pure,
// never mutates its input, no DOM or Node APIs. The editor's Group handles go
// through here.
//
// Rounding, so the edit stays readable in the JSON: Box fields (`x`, `y`,
// `width`, `height`) land on whole px, every other size (font size, letter
// spacing, corner radius, shadow) and `rotation` on 0.1.
import type { GroupLayer, Layer, LeafLayer, Shadow } from './document.ts'
import { layerExtent } from './extent.ts'
import { layoutText, type MeasureText } from './textLayout.ts'

/** A point in Canvas px. */
export type CanvasPoint = { x: number; y: number }

/**
 * The Group scaled uniformly by `factor` (> 0) around `anchor`: every Layer in it
 * has its Box moved away from (or towards) `anchor` and sized by `factor`, and its
 * font size, AutoFit minimum, letter spacing, corner radius and shadow scaled
 * alike. Rotations stay.
 */
export function scaleGroup(group: GroupLayer, factor: number, anchor: CanvasPoint): GroupLayer {
  return { ...group, layers: group.layers.map((layer) => scaleLayer(layer, factor, anchor)) }
}

function scaleLayer(layer: Layer, factor: number, anchor: CanvasPoint): Layer {
  if (layer.type === 'group') return scaleGroup(layer, factor, anchor)
  const px = (value: number) => wholePx(value * factor)
  const tenth = (value: number) => toTenth(value * factor)
  const scaled: LeafLayer = {
    ...layer,
    x: wholePx(anchor.x + (layer.x - anchor.x) * factor),
    y: wholePx(anchor.y + (layer.y - anchor.y) * factor),
    width: px(layer.width),
  }
  if (layer.height !== undefined) scaled.height = px(layer.height)
  if (layer.shadow) scaled.shadow = scaleShadow(layer.shadow, tenth)
  if (scaled.type === 'rect' && scaled.cornerRadius !== undefined) scaled.cornerRadius = tenth(scaled.cornerRadius)
  if (scaled.type === 'text') {
    scaled.fontSize = positiveTenth(scaled.fontSize * factor)
    if (scaled.letterSpacing !== undefined) scaled.letterSpacing = tenth(scaled.letterSpacing)
    if (scaled.autoFit) scaled.autoFit = { ...scaled.autoFit, minFontSize: positiveTenth(scaled.autoFit.minFontSize * factor) }
  }
  return scaled
}

/**
 * The Group rotated by `degrees` (clockwise, like `rotation`) around `pivot`, by
 * default the centre of the Group's Box (core `layerExtent`): the centre of every
 * Layer in it turns around `pivot` and the Layer's `rotation` grows by `degrees`.
 * A text Layer without `height` turns around the centre of its Text Layout, as it
 * is drawn.
 */
export function rotateGroup(group: GroupLayer, degrees: number, measure: MeasureText, pivot?: CanvasPoint): GroupLayer {
  const extent = layerExtent(group, measure)
  const around = pivot ?? { x: extent.x + extent.width / 2, y: extent.y + extent.height / 2 }
  const rad = (degrees * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const rotate = (layer: Layer): Layer => {
    if (layer.type === 'group') return { ...layer, layers: layer.layers.map(rotate) }
    const height = layer.height ?? (layer.type === 'text' ? layoutText(layer, measure).height : 0)
    const dx = layer.x + layer.width / 2 - around.x
    const dy = layer.y + height / 2 - around.y
    const centre = { x: around.x + dx * cos - dy * sin, y: around.y + dx * sin + dy * cos }
    return {
      ...layer,
      x: wholePx(centre.x - layer.width / 2),
      y: wholePx(centre.y - height / 2),
      rotation: toTenth((layer.rotation ?? 0) + degrees),
    }
  }
  return { ...group, layers: group.layers.map(rotate) }
}

function scaleShadow(shadow: Shadow, tenth: (value: number) => number): Shadow {
  return { ...shadow, blur: tenth(shadow.blur), offsetX: tenth(shadow.offsetX), offsetY: tenth(shadow.offsetY) }
}

const wholePx = (value: number): number => Math.round(value) || 0
const toTenth = (value: number): number => Math.round(value * 10) / 10 || 0
/** A font size must stay positive: 0.1 at the least. */
const positiveTenth = (value: number): number => Math.max(0.1, toTenth(value))
