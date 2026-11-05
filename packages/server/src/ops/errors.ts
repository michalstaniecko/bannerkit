import { formatPath, type Issue } from '@bannerkit/core'
import type { z } from 'zod'

export type OpErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_DOCUMENT'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'RENDER_FAILED'

/** A path-located problem: `{ path, message, suggestion? }`, the same shape core validation reports. */
export type OpIssue = Issue

/**
 * The only error type operations throw on purpose. Adapters (CLI, REST, later MCP)
 * map it to their own output; anything else escaping an op is a bug.
 */
export class OpError extends Error {
  readonly code: OpErrorCode
  readonly issues: OpIssue[]

  constructor(code: OpErrorCode, message: string, issues: OpIssue[] = []) {
    super(message)
    this.name = 'OpError'
    this.code = code
    this.issues = issues
  }

  toJSON() {
    return { code: this.code, message: this.message, issues: this.issues }
  }
}

export { formatPath }

/** Validates op input with zod, turning failures into an INVALID_INPUT OpError. */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input)
  if (result.success) return result.data
  const issues = result.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message }))
  const first = issues[0]!
  throw new OpError('INVALID_INPUT', first.path ? `${first.path}: ${first.message}` : first.message, issues)
}
