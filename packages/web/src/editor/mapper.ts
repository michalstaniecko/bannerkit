// The mapper between Document Layers and Fabric objects, in both directions.
//
// Document → Fabric: every object gets `originX/originY = 'center'` explicitly
// (Fabric 7's default, but the editor never relies on defaults), `left/top` = the
// Box centre and `angle` = rotation. Fabric rotates around the origin, so the Box
// top-left plus rotation maps exactly, as in core's `boxTransform`.
//
// Fabric → Document: `objectToLayer(object, base)` reads the Box back from the
// object (centre, size × scale, angle, opacity, visibility) and keeps every other
// field from `base`, the Layer the object was made from. Optional fields absent
// from `base` stay absent while they hold their default, so an untouched
// Document round-trips unchanged.
import { linearGradientLine, type Layer, type LinearGradient, type RectLayer } from '@bannerkit/core'
import { Gradient, Rect, Shadow, type FabricObject } from 'fabric'

/** Lays a Layer out as a Fabric object. Image and text Layers are placeholders until ticket 11. */
export function layerToObject(layer: Layer): FabricObject {
  const object = layer.type === 'rect' ? rectObject(layer) : placeholderObject(layer)
  object.set(commonProps(layer, object.width, object.height))
  object.setCoords()
  return object
}

/** The Layer `object` now shows, with the fields Fabric does not own taken from `base`. */
export function objectToLayer(object: FabricObject, base: Layer): Layer {
  const width = clean(object.width * object.scaleX)
  const height = clean(object.height * object.scaleY)
  const centre = object.getCenterPoint()
  const layer: Layer = { ...base, x: clean(centre.x - width / 2), y: clean(centre.y - height / 2), width }
  if ('height' in base && base.height !== undefined) (layer as { height: number }).height = height
  setOptional(layer, 'rotation', normaliseAngle(object.angle), 0)
  setOptional(layer, 'opacity', object.opacity, 1)
  setOptional(layer, 'visible', object.visible, true)
  return layer
}

// Document → Fabric ---------------------------------------------------------------

/** Placeholder height for a text Layer without a Box height; replaced by real text in ticket 11. */
const PLACEHOLDER_TEXT_LINE_HEIGHT = 1.16

function rectObject(layer: RectLayer): Rect {
  // Fabric clamps rx and ry separately (elliptical corners); the server clamps to the
  // shorter side, so clamp here to match it.
  const radius = Math.min(layer.cornerRadius ?? 0, layer.width / 2, layer.height / 2)
  return new Rect({
    width: layer.width,
    height: layer.height,
    rx: radius,
    ry: radius,
    fill: typeof layer.fill === 'string' ? layer.fill : linearGradient(layer.fill, layer.width, layer.height),
  })
}

function placeholderObject(layer: Exclude<Layer, RectLayer>): Rect {
  const height = layer.height ?? (layer.type === 'text' ? layer.fontSize * PLACEHOLDER_TEXT_LINE_HEIGHT : 0)
  return new Rect({ width: layer.width, height, fill: 'rgba(128,128,128,0.25)' })
}

/** A CSS-convention gradient over a `width × height` Box, via the core helper shared with the server. */
function linearGradient(fill: LinearGradient, width: number, height: number): Gradient<'linear'> {
  const line = linearGradientLine(fill.angle, width, height)
  // Fabric's pixel coords are relative to the object's unscaled top-left, whatever the origin.
  return new Gradient({
    type: 'linear',
    gradientUnits: 'pixels',
    coords: { x1: line.x0, y1: line.y0, x2: line.x1, y2: line.y1 },
    colorStops: fill.stops.map(([color, offset]) => ({ color, offset })),
  })
}

function commonProps(layer: Layer, width: number, height: number) {
  return {
    originX: 'center' as const,
    originY: 'center' as const,
    left: layer.x + width / 2,
    top: layer.y + height / 2,
    angle: layer.rotation ?? 0,
    scaleX: 1,
    scaleY: 1,
    // Fabric 7 defaults strokeWidth to 1 even without a stroke, which grows the Box by 1px.
    strokeWidth: 0,
    stroke: null,
    opacity: layer.opacity ?? 1,
    visible: layer.visible ?? true,
    selectable: !layer.locked,
    evented: !layer.locked,
    shadow: layer.shadow
      ? new Shadow({
          color: layer.shadow.color,
          blur: layer.shadow.blur,
          offsetX: layer.shadow.offsetX,
          offsetY: layer.shadow.offsetY,
        })
      : null,
  }
}

// Fabric → Document ---------------------------------------------------------------

/** Rounds away float noise from the centre ↔ top-left conversion (1e-9 px). */
function clean(n: number): number {
  const r = Math.round(n * 1e9) / 1e9
  return Object.is(r, -0) ? 0 : r
}

function normaliseAngle(angle: number): number {
  return clean(angle)
}

function setOptional<K extends 'rotation' | 'opacity' | 'visible'>(
  layer: Layer,
  key: K,
  value: NonNullable<Layer[K]>,
  fallback: NonNullable<Layer[K]>,
) {
  if (value === fallback && layer[key] === undefined) return
  layer[key] = value
}
