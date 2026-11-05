import { readFile, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  splitRuleIssues,
  validateDocument,
  type Document,
  type DocumentRule,
  type Issue,
  type RuleIssue,
  type ValidationResult,
} from '@bannerkit/core'
import { z } from 'zod'
import { OpError, parseInput } from './errors.ts'
import { Name, Root, documentFile, projectDir as projectDirOf } from './paths.ts'
import { listDocumentFiles, requireProject } from './store.ts'

// Server-side validation: core's validateDocument plus rules that need the
// filesystem. Every read and write of a Document goes through checkDocument.

/** Where a Document lives, for rules that look at the Project around it. */
export type DocumentContext = { projectDir: string }

/**
 * A rule that needs server resources, run after the schema and CORE_RULES pass.
 * Ticket 04 adds the "`src` exists in the Project" rule here.
 */
export type ServerRule = (document: Document, context: DocumentContext) => Promise<RuleIssue[]>

/** Sync rules beyond CORE_RULES that the server applies (e.g. the font manifest, ticket 06). */
export const SERVER_DOCUMENT_RULES: DocumentRule[] = []
/** Async, filesystem-backed rules the server applies. */
export const SERVER_RULES: ServerRule[] = []

/** Validates a parsed value as a Document with every core and server rule. */
export async function checkDocument(value: unknown, context: DocumentContext): Promise<ValidationResult> {
  const core = validateDocument(value, { rules: SERVER_DOCUMENT_RULES })
  if (!core.ok || SERVER_RULES.length === 0) return core
  const found = (await Promise.all(SERVER_RULES.map((rule) => rule(core.document, context)))).flat()
  return splitRuleIssues([...core.warnings.map((w) => ({ ...w, severity: 'warning' as const })), ...found], core.document)
}

/** Validates, throwing INVALID_DOCUMENT with the issues when the value is not a valid Document. */
export async function requireValidDocument(value: unknown, context: DocumentContext, where: string): Promise<Document> {
  const result = await checkDocument(value, context)
  if (result.ok) return result.document
  throw new OpError('INVALID_DOCUMENT', `${where} is not a valid Document (${result.errors.length} issue(s))`, result.errors)
}

/** Reads and parses a Document file without validating it. Bad JSON is an INVALID_DOCUMENT error. */
export async function readJsonFile(path: string, notFound: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new OpError('NOT_FOUND', notFound)
    throw error
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new OpError('INVALID_DOCUMENT', `${path} is not valid JSON: ${(error as Error).message}`)
  }
}

// $schema ----------------------------------------------------------------------

const require = createRequire(import.meta.url)

/** Absolute path of the generated JSON Schema committed in @bannerkit/core. */
export const documentSchemaPath = (): string => require.resolve('@bannerkit/core/document.schema.json')

/**
 * The `$schema` value for a Document stored in `dir`: a relative path editors
 * resolve from the file when the projects root sits near the repo (the usual
 * `./projects`), otherwise a `file://` URL to the schema.
 */
export function schemaRefFrom(dir: string): string {
  const schema = documentSchemaPath()
  const topLevel = (path: string) => resolve(path).split(sep)[1]
  if (topLevel(dir) !== topLevel(schema)) return pathToFileURL(schema).href
  return relative(dir, schema).split(sep).join('/')
}

// validate ---------------------------------------------------------------------

const ValidateInput = z.union([z.object({ root: Root, project: Name }), z.object({ file: z.string().min(1) })])

export type DocumentValidation = {
  project: string
  name: string
  path: string
  ok: boolean
  errors: Issue[]
  warnings: Issue[]
}
export type ValidateResult = { ok: boolean; documents: DocumentValidation[] }

/**
 * Validates every Document in a Project, or one Document file. Invalid
 * Documents are reported, not thrown; only a missing Project or file throws.
 */
export async function validate(input: { root: string; project: string } | { file: string }): Promise<ValidateResult> {
  const parsed = parseInput(ValidateInput, input)
  let targets: { project: string; name: string; path: string; projectDir: string }[]
  if ('file' in parsed) {
    const path = resolve(parsed.file)
    if (!(await isFile(path))) throw new OpError('NOT_FOUND', `File ${path} not found`)
    // A Document file lives at <project>/documents/<doc>.json.
    const projectDir = dirname(dirname(path))
    targets = [{ project: basename(projectDir), name: basename(path, '.json'), path, projectDir }]
  } else {
    const { root, project } = parsed
    await requireProject(root, project)
    targets = (await listDocumentFiles(root, project)).map((name) => ({
      project,
      name,
      path: documentFile(root, project, name),
      projectDir: projectDirOf(root, project),
    }))
  }

  const documents = await Promise.all(
    targets.map(async ({ projectDir, ...ref }): Promise<DocumentValidation> => {
      let result: ValidationResult
      try {
        result = await checkDocument(await readJsonFile(ref.path, `File ${ref.path} not found`), { projectDir })
      } catch (error) {
        if (!(error instanceof OpError) || error.code !== 'INVALID_DOCUMENT') throw error
        result = { ok: false, errors: [{ path: '', message: error.message }], warnings: [] }
      }
      return { ...ref, ok: result.ok, errors: result.errors, warnings: result.warnings }
    }),
  )
  return { ok: documents.every((d) => d.ok), documents }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}
