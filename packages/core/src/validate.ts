import type { z } from 'zod'
import { DOCUMENT_VERSION, DocumentSchema, DocumentV1Schema, type Document } from './document.ts'
import { liftDocument } from './migrate.ts'
import { closest } from './suggest.ts'
import { walkLayers } from './tree.ts'

/**
 * One validation finding. `path` is a JSON path into the Document
 * (`layers[2].fontWeight`, `''` for the root). `suggestion` is the likely
 * intended key or value when the input looks like a typo.
 */
export type Issue = { path: string; message: string; suggestion?: string }

/** What a rule returns: findings tagged as errors (block writes) or warnings (don't). */
export type RuleIssue = Issue & { severity?: 'error' | 'warning' }

/**
 * A cross-field rule over a Document that already matches the schema shape.
 * Later tickets add rules here (font manifest, ticket 06) or pass extra rules
 * in (server-side checks such as `src` existing, ticket 04).
 */
export type DocumentRule = (document: Document) => RuleIssue[]

export type ValidationResult =
  | { ok: true; document: Document; errors: []; warnings: Issue[] }
  | { ok: false; document?: undefined; errors: Issue[]; warnings: Issue[] }

export function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((key, i) => (typeof key === 'number' ? `[${key}]` : i === 0 ? String(key) : `.${String(key)}`))
    .join('')
}

/** Every Layer id is unique within its Document. */
export const uniqueLayerIds: DocumentRule = (document) => {
  const firstPath = new Map<string, string>()
  const issues: RuleIssue[] = []
  for (const { layer, path } of walkLayers(document)) {
    const first = firstPath.get(layer.id)
    if (first === undefined) firstPath.set(layer.id, path)
    else issues.push({ path: `${path}.id`, message: `duplicate Layer id "${layer.id}" (also used by ${first})` })
  }
  return issues
}

/** AutoFit shrinks text to fit its Box, so the Box needs a height. */
export const autoFitRequiresHeight: DocumentRule = (document) =>
  walkLayers(document).flatMap(({ layer, path }) =>
    layer.type === 'text' && layer.autoFit !== undefined && layer.height === undefined
      ? [{ path: `${path}.autoFit`, message: 'autoFit requires height' }]
      : [],
  )

/** Rules every Document must pass, wherever it is validated. */
export const CORE_RULES: readonly DocumentRule[] = [uniqueLayerIds, autoFitRequiresHeight]

/** The Document versions that can be read. Anything older than the current one is lifted on read. */
const READABLE_VERSIONS = [1, DOCUMENT_VERSION] as const

/**
 * Validates an untrusted value as a Document: the strict schema of its
 * `version` first (v1 files by the frozen v1 schema), then CORE_RULES plus any
 * extra `rules`. Rules only run once the shape is valid. A valid Document is
 * always returned as the current version (v2), whatever version it was read as.
 */
export function validateDocument(value: unknown, { rules = [] }: { rules?: readonly DocumentRule[] } = {}): ValidationResult {
  const version = (value as { version?: unknown } | null)?.version
  let document: Document
  if (version === 1) {
    const parsed = DocumentV1Schema.safeParse(value)
    if (!parsed.success) return invalid(parsed.error.issues, value, DocumentV1Schema)
    document = liftDocument(parsed.data)
  } else {
    const parsed = DocumentSchema.safeParse(value)
    if (!parsed.success) return invalid(parsed.error.issues, value, DocumentSchema)
    document = parsed.data
  }
  const found = [...CORE_RULES, ...rules].flatMap((rule) => rule(document))
  return splitRuleIssues(found, document)
}

function invalid(issues: readonly z.core.$ZodIssue[], value: unknown, schema: z.core.$ZodType): ValidationResult {
  return { ok: false, errors: issues.flatMap((issue) => toIssues(issue, value, schema)), warnings: [] }
}

/** Splits rule findings into errors and warnings, producing a ValidationResult. */
export function splitRuleIssues(found: readonly RuleIssue[], document: Document): ValidationResult {
  const strip = ({ severity: _, ...issue }: RuleIssue): Issue => issue
  const errors = found.filter((i) => i.severity !== 'warning').map(strip)
  const warnings = found.filter((i) => i.severity === 'warning').map(strip)
  return errors.length === 0 ? { ok: true, document, errors: [], warnings } : { ok: false, errors, warnings }
}

// zod issue -> Issue -----------------------------------------------------------

function toIssues(issue: z.core.$ZodIssue, input: unknown, schema: z.core.$ZodType): Issue[] {
  const path = formatPath(issue.path)
  switch (issue.code) {
    case 'unrecognized_keys': {
      const known = knownKeys(schema, issue.path, input)
      // Keys the current version knows but the file's older version does not.
      const newer = schema === DocumentSchema ? [] : knownKeys(DocumentSchema, issue.path, input)
      return issue.keys.map((key) =>
        newer.includes(key) && !known.includes(key)
          ? { path: formatPath([...issue.path, key]), message: requiresCurrentVersion(`"${key}"`) }
          : withSuggestion(
              { path: formatPath([...issue.path, key]), message: `unknown key "${key}"` },
              closest(key, known),
            ),
      )
    }
    case 'invalid_value': {
      const actual = valueAt(input, issue.path)
      // `version` accepts every readable version, not just the one of the schema that ran.
      const values = path === 'version' ? READABLE_VERSIONS : issue.values
      const options = values.map(String)
      const expected = values.map((v) => JSON.stringify(v)).join(' | ')
      const message = actual === undefined ? `missing; expected ${expected}` : `expected ${expected}, got ${describe(actual)}`
      return [withSuggestion({ path, message }, typeof actual === 'string' ? closest(actual, options) : undefined)]
    }
    case 'invalid_union': {
      // Discriminated unions report an unknown discriminator with these extra fields.
      const discriminated = issue as typeof issue & { note?: string; discriminator?: string; options?: unknown[] }
      if (discriminated.note === 'No matching discriminator') {
        const actual = valueAt(input, issue.path)
        const options: string[] = (discriminated.options ?? []).map(String)
        const message =
          actual === undefined
            ? `missing; expected ${options.map((o) => `"${o}"`).join(' | ')}`
            : `expected ${options.map((o) => `"${o}"`).join(' | ')}, got ${describe(actual)}`
        return [withSuggestion({ path, message }, typeof actual === 'string' ? closest(actual, options) : undefined)]
      }
      return [{ path, message: issue.message }]
    }
    case 'invalid_type': {
      const actual = valueAt(input, issue.path)
      if (actual === undefined) return [{ path, message: `missing required ${issue.expected}` }]
      return [{ path, message: `expected ${issue.expected}, got ${describe(actual)}` }]
    }
    default:
      return [{ path, message: issue.message }]
  }
}

/** The message for a field only the current Document version has, found in an older-version file. */
function requiresCurrentVersion(what: string): string {
  return `${what} requires version: ${DOCUMENT_VERSION}; run \`bannerkit migrate\``
}

function withSuggestion(issue: Issue, suggestion: string | undefined): Issue {
  return suggestion === undefined ? issue : { ...issue, suggestion }
}

function describe(value: unknown): string {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return JSON.stringify(value)
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = input
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<PropertyKey, unknown>)[key]
  }
  return current
}

/** The keys the schema allows on the object at `path`, resolved against the input (for unions). */
function knownKeys(root: z.core.$ZodType, path: readonly PropertyKey[], input: unknown): string[] {
  let schema: z.core.$ZodType | undefined = root
  let value: unknown = input
  for (const key of path) {
    schema = schema && childSchema(resolve(schema, value), key)
    value = valueAt(value, [key])
  }
  const object = schema && resolve(schema, value)
  return object?._zod.def.type === 'object' ? Object.keys((object as z.core.$ZodObject)._zod.def.shape) : []
}

/** Unwraps optional/nullable and picks the union option matching the value. */
function resolve(schema: z.core.$ZodType, value: unknown): z.core.$ZodType {
  const def = schema._zod.def as z.core.$ZodTypeDef & Record<string, any>
  switch (def.type) {
    case 'optional':
    case 'nullable':
      return resolve(def.innerType, value)
    case 'union': {
      const options = def.options as z.core.$ZodType[]
      const discriminator = def.discriminator as string | undefined
      const objects = options.filter((o) => o._zod.def.type === 'object')
      const match = discriminator
        ? objects.find((o) => {
            const field = (o as z.core.$ZodObject)._zod.def.shape[discriminator]
            return field?._zod.def.type === 'literal' && (field._zod.def as any).values.includes((value as any)?.[discriminator])
          })
        : objects[0]
      return match ?? schema
    }
    default:
      return schema
  }
}

function childSchema(schema: z.core.$ZodType, key: PropertyKey): z.core.$ZodType | undefined {
  const def = schema._zod.def as z.core.$ZodTypeDef & Record<string, any>
  if (def.type === 'object') return def.shape[key as string]
  if (def.type === 'array') return def.element
  if (def.type === 'tuple') return def.items[key as number]
  return undefined
}
