import { readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { boxExtent, layoutText, svgIntrinsicSize, type Issue, type LayerType, type Rect, type Size } from '@bannerkit/core'
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

export type LayerInspection = {
  /** Position in `layers` (0 = bottom). */
  index: number
  id: string
  type: LayerType
  /** The axis-aligned Canvas-space extent of the (rotated) Box (see core's `boxExtent`). */
  extent: Rect
  /** Where `extent` falls relative to the Canvas. */
  placement: CanvasPlacement
  /** In the editor's current Selection. */
  selected: boolean
  text?: TextInspection
  /** Image Layers: the Asset and its intrinsic size (what Fit scales from). */
  asset?: AssetInspection
}

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
  const layers: LayerInspection[] = []
  for (const [index, layer] of document.layers.entries()) {
    const layout = layer.type === 'text' ? layoutText(layer, measureText) : undefined
    const extent = boxExtent({ ...layer, height: layout?.height ?? layer.height! })
    const placement = placementOf(extent, document.canvas)
    if (placement !== 'inside') {
      const where = placement === 'outside' ? 'entirely outside' : 'partly outside'
      outside.push({ path: `layers[${index}]`, message: `Layer "${layer.id}" is ${where} the Canvas` })
    }
    const base = { index, id: layer.id, type: layer.type, extent, placement, selected: selected.has(layer.id) }
    if (layer.type === 'image') {
      layers.push({ ...base, asset: { src: layer.src, ...(await assetSize(dir, layer.src)) } })
      continue
    }
    if (!layout || layer.type !== 'text') {
      layers.push(base)
      continue
    }
    layers.push({
      ...base,
      text: {
        fontSize: layout.fontSize,
        requestedFontSize: layer.fontSize,
        height: layout.height,
        overflow: layout.overflow,
        lines: layout.lines.map((l) => ({ text: l.text, width: l.width })),
      },
    })
  }

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
