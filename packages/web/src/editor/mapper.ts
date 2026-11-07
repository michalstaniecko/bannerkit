// The mapper between Document Layers and Fabric objects, in both directions.
//
// Document → Fabric: every object gets `originX/originY = 'center'` explicitly
// (Fabric 7's default, but the editor never relies on defaults) and `angle` =
// rotation. Each object also has a *local Box*: where the Layer's Box sits in the
// object's own unscaled, centre-origin coordinates. For a rect it is the whole
// object. An image is scaled by its Fit and clipped to its local Box; a Textbox
// may be wider than its Box (an over-long word) and sits inside it by
// `verticalAlign`. The object is placed so that its local Box centre lands on the
// Box centre, rotated around it, as in core's `boxTransform`.
//
// `applyLayer` does that in place, on an existing object: `layerToObject` creates
// the object and applies the Layer, and the editor bakes a finished modification
// by applying the Layer `objectToLayer` reads back (ADR 0001).
//
// Fabric → Document: `objectToLayer(object, base)` maps the local Box back through
// the object's transform (centre, size × scale, angle, opacity, visibility) and
// keeps every other field from `base`, the Layer the object was made from.
// Optional fields absent from `base` stay absent while they hold their default, so
// an untouched Document round-trips unchanged.
import {
  DEFAULT_LINE_HEIGHT,
  applyMatrix,
  boxTransform,
  fitImage,
  fontStyleOf,
  layoutText,
  linearGradientLine,
  type ImageLayer,
  type Layer,
  type LinearGradient,
  type MeasureText,
  type RectLayer,
  type TextLayer,
} from '@bannerkit/core'
import { FabricImage, Gradient, Pattern, Point, Rect, Shadow, Textbox, util, type FabricObject } from 'fabric'

export type MapperEnv = {
  /** The URL an image Layer's project-relative `src` loads from. */
  assetUrl: (src: string) => string
  /** core's `MeasureText`, with the Document's fonts already loaded. */
  measure: MeasureText
}

/** A Box in an object's local coordinates: centre-origin, unscaled. */
type LocalBox = { cx: number; cy: number; width: number; height: number }

const localBoxes = new WeakMap<FabricObject, LocalBox>()

/** Lays a Layer out as a Fabric object. An image whose Asset fails to load becomes a hatched placeholder. */
export async function layerToObject(layer: Layer, env: MapperEnv): Promise<FabricObject> {
  const object =
    layer.type === 'rect'
      ? new Rect()
      : layer.type === 'text'
        ? new DocumentTextbox(layer.text)
        : ((await loadImage(env.assetUrl(layer.src))) ?? new Rect())
  applyLayer(object, layer, env)
  return object
}

/**
 * Lays `layer` out on `object` (made by `layerToObject` for a Layer of the same
 * type) in place. Whatever scale, size or position a transform left on the object
 * is replaced by the Layer's: scale returns to the Fit's (1 for rects and text) and
 * the Box is in `width`/`height`.
 */
export function applyLayer(object: FabricObject, layer: Layer, env: MapperEnv): void {
  let box: LocalBox
  if (layer.type === 'text' && object instanceof Textbox) box = applyText(object, layer, env)
  else if (layer.type === 'image' && object instanceof FabricImage) box = applyImage(object, layer)
  else if (layer.type === 'image' && object instanceof Rect) box = applyPlaceholder(object, layer)
  else if (layer.type === 'rect' && object instanceof Rect) box = applyRect(object, layer)
  else throw new Error(`Layer "${layer.id}" (${layer.type}) cannot be applied to a ${object.type}`)
  object.set(commonProps(layer))
  localBoxes.set(object, box)
  // Put the local Box centre on the Box centre: centre = boxCentre − R(angle)·(cx·scaleX, cy·scaleY).
  // R is core's rotation (boxTransform of a zero-size Box at the origin), the one the server draws with.
  const offset = applyMatrix(boxTransform({ x: 0, y: 0, width: 0, height: 0, rotation: object.angle }), box.cx * object.scaleX, box.cy * object.scaleY)
  object.set({ left: layer.x + box.width * object.scaleX / 2 - offset.x, top: layer.y + box.height * object.scaleY / 2 - offset.y })
  object.setCoords()
}

/** The Layer `object` now shows, with the fields Fabric does not own taken from `base`. */
export function objectToLayer(object: FabricObject, base: Layer): Layer {
  const box = localBoxes.get(object) ?? { cx: 0, cy: 0, width: object.width, height: object.height }
  const width = clean(box.width * object.scaleX)
  const height = clean(box.height * object.scaleY)
  const centre = new Point(box.cx, box.cy).transform(object.calcTransformMatrix())
  const layer: Layer = { ...base, x: clean(centre.x - width / 2), y: clean(centre.y - height / 2), width }
  if ('height' in base && base.height !== undefined) (layer as { height: number }).height = height
  setOptional(layer, 'rotation', normaliseAngle(object.angle), 0)
  setOptional(layer, 'opacity', object.opacity, 1)
  setOptional(layer, 'visible', object.visible, true)
  return layer
}

/** An edge of a text Layer's Box that a resize handle moves. */
export type TextEdge = 'left' | 'right' | 'bottom'

/**
 * The text Layer `object` shows, with one edge of its Box dragged to `point`
 * (scene px) and the opposite edge kept in place. Side edges change only `width`,
 * the bottom edge only `height`, so glyphs are never stretched. Sizes stay ≥ 1px.
 */
export function resizeTextLayer(object: FabricObject, base: TextLayer, edge: TextEdge, point: Point): TextLayer {
  const box = localBoxes.get(object)
  if (!box) throw new Error(`Layer "${base.id}" is not laid out on this object`)
  const matrix = object.calcTransformMatrix()
  const local = point.transform(util.invertTransform(matrix))
  let left = box.cx - box.width / 2
  const top = box.cy - box.height / 2
  let { width, height } = box
  if (edge === 'right') width = Math.max(1, local.x - left)
  if (edge === 'left') {
    width = Math.max(1, left + box.width - local.x)
    left += box.width - width
  }
  if (edge === 'bottom') height = Math.max(1, local.y - top)
  const centre = new Point(left + width / 2, top + height / 2).transform(matrix)
  const layer = objectToLayer(object, base) as TextLayer
  const resized: TextLayer = { ...layer, x: clean(centre.x - width / 2), y: clean(centre.y - height / 2), width: clean(width) }
  if (edge === 'bottom' || layer.height !== undefined) resized.height = clean(height)
  return resized
}

// Document → Fabric ---------------------------------------------------------------

const wholeBox = (width: number, height: number): LocalBox => ({ cx: 0, cy: 0, width, height })

async function loadImage(url: string): Promise<FabricImage | undefined> {
  const image = await FabricImage.fromURL(url).catch(() => undefined)
  return image && image.width > 0 && image.height > 0 ? image : undefined
}

function applyRect(object: Rect, layer: RectLayer): LocalBox {
  // Fabric clamps rx and ry separately (elliptical corners); the server clamps to the
  // shorter side, so clamp here to match it.
  const radius = Math.min(layer.cornerRadius ?? 0, layer.width / 2, layer.height / 2)
  object.set({
    width: layer.width,
    height: layer.height,
    scaleX: 1,
    scaleY: 1,
    rx: radius,
    ry: radius,
    fill: typeof layer.fill === 'string' ? layer.fill : linearGradient(layer.fill, layer.width, layer.height),
  })
  return wholeBox(layer.width, layer.height)
}

/**
 * An image placed by its Fit (the core helper shared with the server): Fabric's
 * crop is the Fit's `source` rect (intrinsic px) and its scale is
 * `dest / source`, so the object covers exactly the `dest` rect of the Box and its
 * handles sit on what is drawn. That is the whole Box for `cover` and `stretch`,
 * and the letterboxed image inside it for `contain`. Nothing lands outside the
 * Box, so nothing is clipped. In the object's local px the Box is `width / scale`
 * wide, centred `(Box centre − dest centre) / scale` from the object centre.
 */
function applyImage(image: FabricImage, layer: ImageLayer): LocalBox {
  const { source, dest } = fitImage(layer.fit, layer, image.getOriginalSize())
  // A zero-sized Box draws nothing; keep the scale finite so the Box still maps back.
  const scaleX = dest.width > 0 ? dest.width / source.width : 1e-9
  const scaleY = dest.height > 0 ? dest.height / source.height : 1e-9
  image.set({ cropX: source.x, cropY: source.y, width: source.width, height: source.height, scaleX, scaleY })
  return {
    cx: (layer.width / 2 - dest.x - dest.width / 2) / scaleX,
    cy: (layer.height / 2 - dest.y - dest.height / 2) / scaleY,
    width: layer.width / scaleX,
    height: layer.height / scaleY,
  }
}

/**
 * A Textbox at the font size core resolves (AutoFit), wrapping at the Box width.
 * Fabric wraps by the same rules as core (ADR 0004; parity is an S3 test) and
 * widens itself to an over-long word, keeping the Box's left edge. The Textbox
 * sits in the Box by `verticalAlign`, and overflowing text is clipped to the Box,
 * like the server.
 */
function applyText(textbox: Textbox, layer: TextLayer, env: MapperEnv): LocalBox {
  const layout = layoutText(layer, env.measure)
  textbox.set({
    text: layer.text,
    width: layer.width,
    scaleX: 1,
    scaleY: 1,
    fontFamily: layer.fontFamily,
    fontWeight: layer.fontWeight,
    fontStyle: fontStyleOf(layer),
    fontSize: layout.fontSize,
    lineHeight: layer.lineHeight ?? DEFAULT_LINE_HEIGHT,
    // Fabric's charSpacing is in 1/1000 em; letterSpacing is in px.
    charSpacing: ((layer.letterSpacing ?? 0) * 1000) / layout.fontSize,
    textAlign: layer.align ?? 'left',
    fill: layer.fill,
    splitByGrapheme: false,
  })
  const spare = layout.height - textbox.height
  const above = layer.verticalAlign === 'middle' ? spare / 2 : layer.verticalAlign === 'bottom' ? spare : 0
  const box: LocalBox = {
    cx: (layer.width - textbox.width) / 2,
    cy: (layout.height - textbox.height) / 2 - above,
    width: layer.width,
    height: layout.height,
  }
  textbox.set({ clipPath: layout.overflow ? boxRect(box) : undefined })
  return box
}

/**
 * A Textbox that measures and draws glyphs unhinted, at their exact outline positions
 * (`textRendering: 'geometricPrecision'`), like the server's skia-canvas. Chrome's
 * default hints and snaps glyphs, which drifts letter-spaced lines and thickens every
 * glyph edge, enough to fail browser-vs-server parity on text-heavy banners.
 */
class DocumentTextbox extends Textbox {
  override _setTextStyles(ctx: CanvasRenderingContext2D, charStyle?: any, forMeasuring?: boolean) {
    super._setTextStyles(ctx, charStyle, forMeasuring)
    ctx.textRendering = 'geometricPrecision'
  }
}

/** A clip rect covering `box`, in the clipped object's local coordinates. */
function boxRect(box: LocalBox): Rect {
  return new Rect({
    originX: 'center',
    originY: 'center',
    left: box.cx,
    top: box.cy,
    width: box.width,
    height: box.height,
    strokeWidth: 0,
  })
}

/** A missing Asset: a hatched rect over the Box, still movable and editable. */
function applyPlaceholder(object: Rect, layer: ImageLayer): LocalBox {
  object.set({ width: layer.width, height: layer.height, scaleX: 1, scaleY: 1, rx: 0, ry: 0, fill: hatch() })
  return wholeBox(layer.width, layer.height)
}

let hatchTile: HTMLCanvasElement | undefined

function hatch(): Pattern {
  if (!hatchTile) {
    const size = 12
    hatchTile = util.createCanvasElement()
    hatchTile.width = size
    hatchTile.height = size
    const ctx = hatchTile.getContext('2d')!
    ctx.fillStyle = '#e4e4e4'
    ctx.fillRect(0, 0, size, size)
    ctx.strokeStyle = '#9a9a9a'
    ctx.lineWidth = 3
    ctx.beginPath()
    // a diagonal plus the two corner pieces, so the tile repeats seamlessly
    for (const [x0, y0, x1, y1] of [
      [-1, size + 1, size + 1, -1],
      [-1, 1, 1, -1],
      [size - 1, size + 1, size + 1, size - 1],
    ] as const) {
      ctx.moveTo(x0, y0)
      ctx.lineTo(x1, y1)
    }
    ctx.stroke()
  }
  return new Pattern({ source: hatchTile, repeat: 'repeat' })
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

/** A locked or hidden Layer: selectable only from the Layer list, never moved on the Canvas. */
export function isFrozen(layer: Layer): boolean {
  return layer.locked === true || layer.visible === false
}

function commonProps(layer: Layer) {
  return {
    originX: 'center' as const,
    originY: 'center' as const,
    angle: layer.rotation ?? 0,
    // Fabric 7 defaults strokeWidth to 1 even without a stroke, which grows the Box by 1px.
    strokeWidth: 0,
    stroke: null,
    opacity: layer.opacity ?? 1,
    visible: layer.visible ?? true,
    selectable: !layer.locked,
    evented: !layer.locked,
    // Selected from the Layer list, a locked or hidden Layer shows no handles and does not move.
    hasControls: !isFrozen(layer),
    lockMovementX: isFrozen(layer),
    lockMovementY: isFrozen(layer),
    // A Layer never flips or skews: the Document has no field for either.
    lockScalingFlip: true,
    lockSkewingX: true,
    lockSkewingY: true,
    shadow: layer.shadow
      ? new Shadow({
          color: layer.shadow.color,
          blur: layer.shadow.blur,
          offsetX: layer.shadow.offsetX,
          offsetY: layer.shadow.offsetY,
          // Shadow values are Document px, like the server draws them. By default Fabric
          // multiplies them by the object's scale, which an image keeps for its Fit.
          nonScaling: true,
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
