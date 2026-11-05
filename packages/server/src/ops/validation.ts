import { readFile, readdir, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  closest,
  fontsInManifest,
  splitRuleIssues,
  textOverflow,
  validateDocument,
  type Document,
  type DocumentRule,
  type ImageLayer,
  type Issue,
  type RuleIssue,
  type ValidationResult,
} from '@bannerkit/core'
import { z } from 'zod'
import { fontManifest, measureText } from '../render/fonts.ts'
import { OpError, parseInput } from './errors.ts'
import { Name, Root, documentFile, projectDir as projectDirOf } from './paths.ts'
import { listDocumentFiles, requireProject } from './store.ts'

// Server-side validation: core's validateDocument plus rules that need the
// filesystem. Every read and write of a Document goes through checkDocument.

/**
 * How a missing Asset file counts. The CLI (`validate`, `render`, `preview`) and
 * agents keep it an `error`; the editor's REST read makes it a `warning`, so a
 * Document whose Asset was deleted still opens (as a placeholder). A function
 * decides per image Layer (the editor's save: see writeDocument's `'unchanged'`).
 */
export type MissingAssets = 'error' | 'warning' | ((layer: ImageLayer) => 'error' | 'warning')

/** Where a Document lives, for rules that look at the Project around it. */
export type DocumentContext = { projectDir: string; missingAssets?: MissingAssets }

/**
 * A rule that needs server resources, run after the schema and CORE_RULES pass.
 * See assetsExist.
 */
export type ServerRule = (document: Document, context: DocumentContext) => Promise<RuleIssue[]>

/**
 * Sync rules beyond CORE_RULES that the server applies: font family/weight in
 * the font manifest (error), and text overflowing its Box (warning).
 */
export const SERVER_DOCUMENT_RULES: DocumentRule[] = [
  fontsInManifest(fontManifest()),
  textOverflow(fontManifest(), measureText),
]

/**
 * Every image Layer's `src` names a file inside the Project. A miss suggests
 * the closest existing Asset; it is an error unless `missingAssets` makes it
 * a `'warning'`. A `src` that leaves the Project is always an error.
 */
export const assetsExist: ServerRule = async (document, { projectDir, missingAssets = 'error' }) => {
  const issues: RuleIssue[] = []
  let assets: string[] | undefined
  for (const [i, layer] of document.layers.entries()) {
    if (layer.type !== 'image') continue
    const path = `layers[${i}].src`
    const { src } = layer
    if (isAbsolute(src) || /^[A-Za-z]:/.test(src) || src.split(/[\\/]/).includes('..')) {
      issues.push({ path, message: `src "${src}" must be a project-relative path inside the Project` })
      continue
    }
    if (await isFile(join(projectDir, src))) continue
    assets ??= await listAssets(projectDir)
    const suggestion = closest(src, assets)
    issues.push({
      path,
      message: `Asset "${src}" not found in Project "${basename(projectDir)}"`,
      ...(suggestion === undefined ? {} : { suggestion }),
      ...((typeof missingAssets === 'function' ? missingAssets(layer) : missingAssets) === 'warning'
        ? { severity: 'warning' as const }
        : {}),
    })
  }
  return issues
}

/** Project-relative paths of every file under assets/. */
async function listAssets(projectDir: string): Promise<string[]> {
  try {
    const entries = await readdir(join(projectDir, 'assets'), { recursive: true, withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && !e.name.startsWith('.'))
      .map((e) => relative(projectDir, join(e.parentPath, e.name)).split(sep).join('/'))
  } catch {
    return []
  }
}

/** Async, filesystem-backed rules the server applies. */
export const SERVER_RULES: ServerRule[] = [assetsExist]

/** Validates a parsed value as a Document with every core and server rule. */
export async function checkDocument(value: unknown, context: DocumentContext): Promise<ValidationResult> {
  const core = validateDocument(value, { rules: SERVER_DOCUMENT_RULES })
  if (!core.ok || SERVER_RULES.length === 0) return core
  const found = (await Promise.all(SERVER_RULES.map((rule) => rule(core.document, context)))).flat()
  return splitRuleIssues([...core.warnings.map((w) => ({ ...w, severity: 'warning' as const })), ...found], core.document)
}

/**
 * Validates, throwing INVALID_DOCUMENT with the issues when the value is not a
 * valid Document; otherwise returns it with its warnings.
 */
export async function requireValidDocument(
  value: unknown,
  context: DocumentContext,
  where: string,
): Promise<{ document: Document; warnings: Issue[] }> {
  const result = await checkDocument(value, context)
  if (result.ok) return { document: result.document, warnings: result.warnings }
  throw new OpError('INVALID_DOCUMENT', `${where} is not a valid Document (${result.errors.length} issue(s))`, result.errors)
}

/** Reads and parses a Document file without validating it. Bad JSON is an INVALID_DOCUMENT error. */
export async function readJsonFile(path: string, notFound: string): Promise<unknown> {
  return (await readJsonFileBytes(path, notFound)).json
}

/** Like readJsonFile, also answering the file's raw bytes (e.g. to hash them). */
export async function readJsonFileBytes(path: string, notFound: string): Promise<{ json: unknown; bytes: Buffer }> {
  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new OpError('NOT_FOUND', notFound)
    throw error
  }
  try {
    return { json: JSON.parse(bytes.toString('utf8')), bytes }
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
