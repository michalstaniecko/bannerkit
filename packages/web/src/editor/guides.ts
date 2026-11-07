// Guides in the editor: the pure edits and lookups `dragGuide` and the Canvas hit
// testing are built on. A Guide is addressed by its axis (`x`: a vertical Guide at an
// x, in `guides.x`) and its index in that array.
import type { Document } from '@bannerkit/core'
import type { Axis } from './snapping/targets.ts'

/**
 * `document` with the Guide `index` on `axis` set to `value` (`'new'`: appended), or
 * removed when `value` is undefined. The first Guide adds the `guides` key (before
 * `layers`, as the schema orders it); removing the last one drops it.
 */
export function setGuide(document: Document, axis: Axis, index: number | 'new', value: number | undefined): Document {
  const guides = { x: [...(document.guides?.x ?? [])], y: [...(document.guides?.y ?? [])] }
  const list = guides[axis]
  if (index === 'new') {
    if (value === undefined) return document
    list.push(value)
  } else if (value === undefined) list.splice(index, 1)
  else list[index] = value
  const { guides: _, ...rest } = document
  if (guides.x.length === 0 && guides.y.length === 0) return rest
  if (document.guides) return { ...document, guides }
  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(rest)) {
    if (key === 'layers') out.guides = guides
    out[key] = entry
  }
  return out as Document
}

/** The Guide nearest `point` (Canvas px) within `tolerance` Canvas px, if any. */
export function guideAt(guides: Document['guides'], point: { x: number; y: number }, tolerance: number): { axis: Axis; index: number } | undefined {
  let best: { axis: Axis; index: number; distance: number } | undefined
  for (const axis of ['x', 'y'] as const) {
    ;(guides?.[axis] ?? []).forEach((at, index) => {
      const distance = Math.abs(at - point[axis])
      if (distance <= tolerance && (!best || distance < best.distance)) best = { axis, index, distance }
    })
  }
  return best && { axis: best.axis, index: best.index }
}
