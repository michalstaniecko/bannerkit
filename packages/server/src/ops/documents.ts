import { readFile, readdir } from 'node:fs/promises'
import {
  DEFAULT_BACKGROUND,
  DOCUMENT_VERSION,
  DocumentSchema,
  exactlyOneSize,
  resolveSize,
  sizeChoiceShape,
  type Document,
  type SizeChoice,
} from '@bannerkit/core'
import { z } from 'zod'
import { OpError, formatPath, parseInput } from './errors.ts'
import { pathExists, writeJsonAtomic } from './fs.ts'
import { Name, Root, documentFile, documentsDir, projectFile } from './paths.ts'

export type DocumentRef = { project: string; name: string; path: string }
export type DocumentResult = DocumentRef & { document: Document }

async function requireProject(root: string, project: string): Promise<void> {
  if (!(await pathExists(projectFile(root, project)))) {
    throw new OpError('NOT_FOUND', `Project "${project}" not found in ${root}`)
  }
}

/** Validates a parsed Document, throwing INVALID_DOCUMENT with path-located issues. */
function checkDocument(value: unknown, where: string): Document {
  const result = DocumentSchema.safeParse(value)
  if (result.success) return result.data
  const issues = result.error.issues.map((i) => ({ path: formatPath(i.path), message: i.message }))
  throw new OpError('INVALID_DOCUMENT', `${where} is not a valid Document (${issues.length} issue(s))`, issues)
}

// listDocuments ---------------------------------------------------------------

const ListDocumentsInput = z.object({ root: Root, project: Name })

/** Documents are discovered by listing the documents folder; there is no second list. */
export async function listDocuments(input: z.input<typeof ListDocumentsInput>): Promise<DocumentRef[]> {
  const { root, project } = parseInput(ListDocumentsInput, input)
  await requireProject(root, project)
  const entries = await readdir(documentsDir(root, project), { withFileTypes: true })
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.json') && !e.name.startsWith('.'))
    .map((e) => e.name.slice(0, -'.json'.length))
    .sort()
    .map((name) => ({ project, name, path: documentFile(root, project, name) }))
}

// readDocument / writeDocument ------------------------------------------------

const ReadDocumentInput = z.object({ root: Root, project: Name, name: Name })

export async function readDocument(input: z.input<typeof ReadDocumentInput>): Promise<DocumentResult> {
  const { root, project, name } = parseInput(ReadDocumentInput, input)
  await requireProject(root, project)
  const path = documentFile(root, project, name)
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new OpError('NOT_FOUND', `Document "${name}" not found in Project "${project}"`)
    }
    throw error
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (error) {
    throw new OpError('INVALID_DOCUMENT', `${path} is not valid JSON: ${(error as Error).message}`)
  }
  return { project, name, path, document: checkDocument(json, path) }
}

const WriteDocumentInput = z.object({
  root: Root,
  project: Name,
  name: Name,
  document: z.unknown(),
  /** When false, refuses to replace an existing Document. */
  overwrite: z.boolean().default(true),
})

/** Validates, then writes atomically. Invalid Documents never reach disk. */
export async function writeDocument(input: z.input<typeof WriteDocumentInput>): Promise<DocumentResult> {
  const { root, project, name, document, overwrite } = parseInput(WriteDocumentInput, input)
  await requireProject(root, project)
  const path = documentFile(root, project, name)
  const valid = checkDocument(document, `Document "${name}"`)
  if (!overwrite && (await pathExists(path))) {
    throw new OpError('ALREADY_EXISTS', `Document "${name}" already exists in Project "${project}"`)
  }
  await writeJsonAtomic(path, valid)
  return { project, name, path, document: valid }
}

// createDocument / duplicateDocument ------------------------------------------

const CreateDocumentInput = z
  .object({ root: Root, project: Name, name: Name, ...sizeChoiceShape })
  .refine(...exactlyOneSize)
export type CreateDocumentInput = { root: string; project: string; name: string } & SizeChoice

export async function createDocument(input: CreateDocumentInput): Promise<DocumentResult> {
  const { root, project, name, ...choice } = parseInput(CreateDocumentInput, input)
  const { width, height } = resolveSize(choice)
  const document: Document = {
    version: DOCUMENT_VERSION,
    name,
    canvas: { width, height, background: DEFAULT_BACKGROUND },
    layers: [],
  }
  return writeDocument({ root, project, name, document, overwrite: false })
}

const DuplicateDocumentInput = z
  .object({ root: Root, project: Name, from: Name, name: Name.optional(), ...sizeChoiceShape })
  .refine(...exactlyOneSize)
export type DuplicateDocumentInput = { root: string; project: string; from: string; name?: string } & SizeChoice

/**
 * Copies a Document onto another size with its Layers unchanged. The new name
 * defaults to `<from>-<W>x<H>`.
 */
export async function duplicateDocument(input: DuplicateDocumentInput): Promise<DocumentResult> {
  const { root, project, from, name, ...choice } = parseInput(DuplicateDocumentInput, input)
  const source = await readDocument({ root, project, name: from })
  const { width, height } = resolveSize(choice)
  const target = name ?? `${from}-${width}x${height}`
  const document: Document = {
    ...source.document,
    name: target,
    canvas: { ...source.document.canvas, width, height },
  }
  return writeDocument({ root, project, name: target, document, overwrite: false })
}
