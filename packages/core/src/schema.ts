import { z } from 'zod'
import { DocumentSchema, LAYER_TYPES, type LayerType } from './document.ts'

/** The generated JSON Schema, relative to the `@bannerkit/core` package root. Regenerate with `pnpm schema`. */
export const DOCUMENT_SCHEMA_FILE = 'schema/document.schema.json'

/** JSON Schema (draft 2020-12) for Document v1, generated from the zod schema. */
export function documentJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(DocumentSchema, { target: 'draft-2020-12' }) as Record<string, unknown>
}

/**
 * The next readable Layer id for `type`: `<type>-<n>` with n one above the
 * highest existing `<type>-<n>` (so `text-1`, `text-2`, ... never collide).
 */
export function nextLayerId(layers: readonly { id: string }[], type: LayerType): string {
  if (!LAYER_TYPES.includes(type)) throw new Error(`nextLayerId: unknown Layer type "${type}"`)
  const pattern = new RegExp(`^${type}-(\\d+)$`)
  const highest = layers.reduce((max, { id }) => {
    const match = pattern.exec(id)
    return match ? Math.max(max, Number(match[1])) : max
  }, 0)
  return `${type}-${highest + 1}`
}
