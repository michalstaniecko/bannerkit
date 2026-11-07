import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { layerExtent, layoutText, svgIntrinsicSize, type Issue, type Layer, type LeafLayer, type Rect, type Size } from '@bannerkit/core'
import sharp from 'sharp'
import { z } from 'zod'
import { measureText } from '../render/fonts.ts'
import { OpError, parseInput } from './errors.ts'
import { Name, Root, documentFile, projectDir } from './paths.ts'
import { readSelection, type Selection } from './selection.ts'
import { requireProject } from './store.ts'
import { checkDocument, readJsonFile } from './validation.ts'

// inspect: what the Document JSON alone cannot show an agent. The shape of
// InspectResult is the stable `bannerkit inspect --json` contract.

const InspectInput = z.object({
  root: Root,
  project: Name,
  /** The Document to inspect; defaults to the one the Selection is in. */
  name: Name.optional(),
})

export type TextInspection = {
  /** The size the text is drawn at, after AutoFit. */
  fontSize: number
  /** The Layer's `fontSize`. */
  requestedFontSize: number
  /** Box height the text is laid out and clipped in (the text block height when the Layer has none). */
  height: number
  /** Still does not fit its Box, so it renders clipped. */
  overflow: boolean
  /** Lines as drawn: text and width in px. */
  lines: { text: string; width: number }[]
}

/** `partial` and `outside` Layers are also reported as warnings. */
export type CanvasPlacement = 'inside' | 'partial' | 'outside'

export type AssetInspection = { src: string; width: number; height: number }

type InspectionBase = {
  /** Position in its parent's `layers` (0 = bottom): the Document's, or its Group's. */
  index: number
  id: string
  /** The axis-aligned Canvas-space extent: of the (rotated) Box, or a Group's Box bounding all its children (core's `layerExtent`). */
  extent: Rect
  /** Where `extent` falls relative to the Canvas. */
  placement: CanvasPlacement
  /** In the editor's current Selection. */
  selected: boolean
}

/** A rect, image or text Layer. */
export type LeafInspection = InspectionBase & {
  type: LeafLayer['type']
  text?: TextInspection
  /** Image Layers: the Asset and its intrinsic size (what Fit scales from). */
  asset?: AssetInspection
}

/** A Group, with its children's entries nested in draw order. */
export type GroupInspection = InspectionBase & {
  type: 'group'
  name?: string
  layers: LayerInspection[]
}

export type LayerInspection = LeafInspection | GroupInspection

export type InspectResult = {
  project: string
  name: string
  path: string
  canvas: { width: number; height: number }
  /** The editor's Selection when it is in this Document, otherwise null. */
  selection: Selection | null
  layers: LayerInspection[]
  /** Validation warnings (text overflow), then Layers outside the Canvas; path-located. */
  warnings: Issue[]
}

export async function inspect(input: z.input<typeof InspectInput>): Promise<InspectResult> {
  const { root, project, ...rest } = parseInput(InspectInput, input)
  const recorded = await readSelection({ root, project })
  const name = rest.name ?? recorded?.doc
  if (name === undefined) {
    throw new OpError('INVALID_INPUT', 'name: give a Document name; no Selection is recorded to pick one', [
      { path: 'name', message: 'required when no Selection is recorded' },
    ])
  }
  const selection = recorded?.doc === name ? recorded : null
  const selected = new Set(selection?.selectedLayerIds)
  const path = documentFile(root, project, name)
  const json = await readJsonFile(path, `Document "${name}" not found in Project "${project}"`)
  const checked = await checkDocument(json, { projectDir: projectDir(root, project) })
  if (!checked.ok) {
    throw new OpError('INVALID_DOCUMENT', `${path} is not a valid Document (${checked.errors.length} issue(s))`, checked.errors)
  }
  const { document } = checked

  const outside: Issue[] = []
  const dir = projectDir(root, project)

  /** The entry of `layer`, sitting at `index` of its parent, with Issue path `path`. */
  async function entry(layer: Layer, index: number, path: string): Promise<LayerInspection> {
    const extent = layerExtent(layer, measureText)
    const placement = placementOf(extent, document.canvas)
    const base = { index, id: layer.id, extent, placement, selected: selected.has(layer.id) }
    if (layer.type === 'group') {
      // No "outside" warning: a Group's Box is derived, its leaves get their own.
      return { ...base, type: 'group', ...(layer.name !== undefined && { name: layer.name }), layers: await entries(layer.layers, path) }
    }
    if (placement !== 'inside') {
      const where = placement === 'outside' ? 'entirely outside' : 'partly outside'
      outside.push({ path, message: `Layer "${layer.id}" is ${where} the Canvas` })
    }
    if (layer.type === 'image') {
      return { ...base, type: layer.type, asset: { src: layer.src, ...(await assetSize(dir, layer.src)) } }
    }
    if (layer.type === 'rect') return { ...base, type: layer.type }
    const layout = layoutText(layer, measureText)
    return {
      ...base,
      type: layer.type,
      text: {
        fontSize: layout.fontSize,
        requestedFontSize: layer.fontSize,
        height: layout.height,
        overflow: layout.overflow,
        lines: layout.lines.map((l) => ({ text: l.text, width: l.width })),
      },
    }
  }

  /** The entries of the Layers held by the parent at `parentPath` (`''` for the Document), one after another so warnings stay in draw order. */
  async function entries(layers: Layer[], parentPath: string): Promise<LayerInspection[]> {
    const found: LayerInspection[] = []
    for (const [i, layer] of layers.entries()) {
      found.push(await entry(layer, i, `${parentPath && `${parentPath}.`}layers[${i}]`))
    }
    return found
  }

  const layers = await entries(document.layers, '')

  return {
    project,
    name,
    path,
    canvas: { width: document.canvas.width, height: document.canvas.height },
    selection,
    layers,
    warnings: [...checked.warnings, ...outside],
  }
}

/**
 * An Asset's intrinsic size: parsed from `width`/`height`/`viewBox` for SVG, from
 * sharp metadata for raster files (already upright, since ingest auto-orients).
 * The Asset is known to exist: validation checked it.
 */
async function assetSize(dir: string, src: string): Promise<Size> {
  const path = join(dir, src)
  if (extname(src).toLowerCase() === '.svg') {
    const size = svgIntrinsicSize(await readFile(path, 'utf8'))
    if (size) return size
  }
  const { width, height } = await sharp(path).metadata()
  return { width, height }
}

/** Sub-pixel slack so float noise from rotation does not count as poking out. */
const EPSILON = 1e-6

function placementOf(b: Rect, canvas: Size): CanvasPlacement {
  const { width: w, height: h } = canvas
  if (b.x >= w || b.y >= h || b.x + b.width <= 0 || b.y + b.height <= 0) return 'outside'
  const inside = b.x >= -EPSILON && b.y >= -EPSILON && b.x + b.width <= w + EPSILON && b.y + b.height <= h + EPSILON
  return inside ? 'inside' : 'partial'
}
