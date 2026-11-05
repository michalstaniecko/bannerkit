// SVG intrinsic size, shared by ingest (server) and the editor, so both
// renderers draw an SVG Asset at its real size rather than the 300x150 default.

export type IntrinsicSize = { width: number; height: number }

/** CSS pixels per unit for the absolute lengths SVG allows (96 dpi). */
const UNITS: Record<string, number> = { '': 1, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16 }

/**
 * The size of an SVG's root `<svg>` element: `width`/`height` when both are
 * absolute lengths, one of them plus the `viewBox` aspect ratio, or the
 * `viewBox` alone. Percentages and relative units are ignored. Returns
 * undefined when no positive size can be found.
 */
export function svgIntrinsicSize(text: string): IntrinsicSize | undefined {
  const attrs = rootSvgAttributes(text)
  if (!attrs) return undefined
  const width = length(attrs.width)
  const height = length(attrs.height)
  const box = viewBox(attrs.viewBox)
  if (width !== undefined && height !== undefined) return { width, height }
  if (!box) return undefined
  if (width !== undefined) return { width, height: (width * box.height) / box.width }
  if (height !== undefined) return { width: (height * box.width) / box.height, height }
  return box
}

function rootSvgAttributes(text: string): Record<string, string> | undefined {
  const body = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '')
  const tag = /<([A-Za-z_][\w.-]*:)?svg(\s[^>]*)?\/?>/.exec(body)
  if (!tag) return undefined
  // Only the first element counts as the root.
  const before = body.slice(0, tag.index)
  if (/<[A-Za-z_]/.test(before)) return undefined
  const attrs: Record<string, string> = {}
  for (const [, name, double, single] of (tag[2] ?? '').matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[name!] = (double ?? single)!
  }
  return attrs
}

function length(value: string | undefined): number | undefined {
  const match = value === undefined ? null : /^\s*([+]?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(value)
  if (!match) return undefined
  const unit = UNITS[match[2]!.toLowerCase()]
  const n = Number(match[1]) * (unit ?? NaN)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function viewBox(value: string | undefined): IntrinsicSize | undefined {
  const parts = value?.trim().split(/[\s,]+/).map(Number)
  if (!parts || parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return undefined
  const [, , width, height] = parts as [number, number, number, number]
  return width > 0 && height > 0 ? { width, height } : undefined
}
