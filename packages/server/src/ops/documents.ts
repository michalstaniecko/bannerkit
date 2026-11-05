import {
  DEFAULT_BACKGROUND,
  DOCUMENT_VERSION,
  exactlyOneSize,
  resolveSize,
  sizeChoiceShape,
  type Document,
  type Issue,
  type SizeChoice,
} from '@bannerkit/core'
import { z } from 'zod'
import { OpError, parseInput } from './errors.ts'
import { contentHash, pathExists, serializeJson, writeFileAtomic } from './fs.ts'
import { Name, Root, documentFile, documentsDir, projectDir } from './paths.ts'
import { listDocumentFiles, requireProject } from './store.ts'
import { readJsonFileBytes, requireValidDocument, schemaRefFrom } from './validation.ts'

export type DocumentRef = { project: string; name: string; path: string }
/** `hash` is the content hash of the Document file's bytes (see contentHash). */
export type DocumentResult = DocumentRef & { document: Document; warnings: Issue[]; hash: string }

// listDocuments ---------------------------------------------------------------

const ListDocumentsInput = z.object({ root: Root, project: Name })

/** Documents are discovered by listing the documents folder; there is no second list. */
export async function listDocuments(input: z.input<typeof ListDocumentsInput>): Promise<DocumentRef[]> {
  const { root, project } = parseInput(ListDocumentsInput, input)
  await requireProject(root, project)
  return (await listDocumentFiles(root, project)).map((name) => ({ project, name, path: documentFile(root, project, name) }))
}

// readDocument / writeDocument ------------------------------------------------

/** See MissingAssets: `'warning'` is for the editor; everything else keeps the default. */
const MissingAssetsInput = z.enum(['error', 'warning']).default('error')

const ReadDocumentInput = z.object({ root: Root, project: Name, name: Name, missingAssets: MissingAssetsInput })

export async function readDocument(input: z.input<typeof ReadDocumentInput>): Promise<DocumentResult> {
  const { root, project, name, missingAssets } = parseInput(ReadDocumentInput, input)
  await requireProject(root, project)
  const path = documentFile(root, project, name)
  const { json, bytes } = await readJsonFileBytes(path, `Document "${name}" not found in Project "${project}"`)
  const { document, warnings } = await requireValidDocument(json, { projectDir: projectDir(root, project), missingAssets }, path)
  return { project, name, path, document, warnings, hash: contentHash(bytes) }
}

const WriteDocumentInput = z.object({
  root: Root,
  project: Name,
  name: Name,
  document: z.unknown(),
  /** When false, refuses to replace an existing Document. */
  overwrite: z.boolean().default(true),
  missingAssets: MissingAssetsInput,
})

/** Validates (schema, core and server rules), then writes atomically. Invalid Documents never reach disk. */
export async function writeDocument(input: z.input<typeof WriteDocumentInput>): Promise<DocumentResult> {
  const { root, project, name, document, overwrite, missingAssets } = parseInput(WriteDocumentInput, input)
  await requireProject(root, project)
  const path = documentFile(root, project, name)
  const valid = await requireValidDocument(document, { projectDir: projectDir(root, project), missingAssets }, `Document "${name}"`)
  if (!overwrite && (await pathExists(path))) {
    throw new OpError('ALREADY_EXISTS', `Document "${name}" already exists in Project "${project}"`)
  }
  const bytes = serializeJson(valid.document)
  await writeFileAtomic(path, bytes)
  return { project, name, path, ...valid, hash: contentHash(bytes) }
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
    $schema: schemaRefFrom(documentsDir(root, project)),
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
