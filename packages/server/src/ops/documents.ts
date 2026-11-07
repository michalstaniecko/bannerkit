import { readFile } from 'node:fs/promises'
import {
  AnchorSchema,
  DEFAULT_BACKGROUND,
  DOCUMENT_VERSION,
  exactlyOneSize,
  group,
  resizeCanvas,
  resolveSize,
  sizeChoiceShape,
  ungroup,
  type Anchor,
  type Document,
  type DocumentRef,
  type DocumentResult,
  type SizeChoice,
  type TreeEditResult,
} from '@bannerkit/core'
import { z } from 'zod'
import { OpError, parseInput, type ConflictCurrent } from './errors.ts'
import { contentHash, pathExists, serializeJson, writeFileAtomic } from './fs.ts'
import { Name, Root, documentFile, documentsDir, projectDir } from './paths.ts'
import { listDocumentFiles, requireProject } from './store.ts'
import { readJsonFileBytes, requireValidDocument, schemaRefFrom, type MissingAssets } from './validation.ts'

export type { DocumentRef, DocumentResult }

// listDocuments ---------------------------------------------------------------

const ListDocumentsInput = z.object({ root: Root, project: Name })

/** Documents are discovered by listing the documents folder; there is no second list. */
export async function listDocuments(input: z.input<typeof ListDocumentsInput>): Promise<DocumentRef[]> {
  const { root, project } = parseInput(ListDocumentsInput, input)
  await requireProject(root, project)
  return (await listDocumentFiles(root, project)).map((name) => ({ project, name, path: documentFile(root, project, name) }))
}

// readDocument / writeDocument ------------------------------------------------

/** See MissingAssets: `'warning'` is for the editor's read; everything else keeps the default. */
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
  /**
   * `'unchanged'` (the editor's save): a missing Asset is a warning only on an image
   * Layer that had that same `src` in the file on disk, so a Document whose Asset was
   * deleted still saves, but a newly introduced missing `src` (a typo) is an error.
   */
  missingAssets: z.enum(['error', 'warning', 'unchanged']).default('error'),
  /**
   * The content hash of the version the caller last read or wrote. When given, the
   * write happens only if the file still has it; otherwise it fails with CONFLICT
   * and the file as it is now. Omitted, the write is unconditional.
   */
  expectedHash: z.string().min(1).optional(),
})

/** Validates (schema, core and server rules), then writes atomically. Invalid Documents never reach disk. */
export async function writeDocument(input: z.input<typeof WriteDocumentInput>): Promise<DocumentResult> {
  const { root, project, name, document, overwrite, missingAssets, expectedHash } = parseInput(WriteDocumentInput, input)
  await requireProject(root, project)
  const path = documentFile(root, project, name)
  const onDisk = expectedHash !== undefined || missingAssets === 'unchanged' ? await readCurrent(path) : undefined
  if (expectedHash !== undefined && onDisk?.hash !== expectedHash) {
    throw new OpError('CONFLICT', `Document "${name}" changed on disk since it was read`, [], onDisk)
  }
  const missing = missingAssets === 'unchanged' ? missingWhereUnchanged(onDisk?.document) : missingAssets
  const valid = await requireValidDocument(document, { projectDir: projectDir(root, project), missingAssets: missing }, `Document "${name}"`)
  if (!overwrite && (await pathExists(path))) {
    throw new OpError('ALREADY_EXISTS', `Document "${name}" already exists in Project "${project}"`)
  }
  const bytes = serializeJson(valid.document)
  await writeFileAtomic(path, bytes)
  return { project, name, path, ...valid, hash: contentHash(bytes) }
}

/** The Document file as it is now (parsed, not validated), or undefined when there is none or it is not JSON. */
async function readCurrent(path: string): Promise<ConflictCurrent | undefined> {
  let bytes: Buffer
  try {
    bytes = await readFile(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
  let document: unknown
  try {
    document = JSON.parse(bytes.toString('utf8'))
  } catch {
    document = null
  }
  return { document, hash: contentHash(bytes) }
}

/** A missing Asset is a warning only where that image Layer id already had that `src` in `current`. */
function missingWhereUnchanged(current: unknown): MissingAssets {
  const known = new Set<string>()
  // `current` is unvalidated JSON, so walk it (Groups included) without trusting its shape.
  const collect = (parent: unknown): void => {
    const layers = (parent as { layers?: unknown } | null | undefined)?.layers
    if (!Array.isArray(layers)) return
    for (const layer of layers as ({ type?: unknown; id?: unknown; src?: unknown } | null)[]) {
      if (layer?.type === 'image' && typeof layer.id === 'string' && typeof layer.src === 'string') known.add(`${layer.id}\0${layer.src}`)
      if (layer?.type === 'group') collect(layer)
    }
  }
  collect(current)
  return (layer) => (known.has(`${layer.id}\0${layer.src}`) ? 'warning' : 'error')
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
  const { $schema: _, ...copied } = source.document
  const document: Document = {
    // Always this folder's schema reference, whether or not the source had one.
    $schema: schemaRefFrom(documentsDir(root, project)),
    ...copied,
    name: target,
    canvas: { ...copied.canvas, width, height },
  }
  return writeDocument({ root, project, name: target, document, overwrite: false })
}

// resizeDocument ----------------------------------------------------------------

const ResizeDocumentInput = z
  .object({ root: Root, project: Name, name: Name, ...sizeChoiceShape, anchor: AnchorSchema.default('top-left') })
  .refine(...exactlyOneSize)
export type ResizeDocumentInput = { root: string; project: string; name: string; anchor?: Anchor } & SizeChoice

/**
 * Resizes a Document's Canvas in place around an Anchor (core `resizeCanvas`):
 * Layers move, never scale, and may end up off the Canvas. The write is unconditional.
 */
export async function resizeDocument(input: ResizeDocumentInput): Promise<DocumentResult> {
  const { root, project, name, anchor, ...choice } = parseInput(ResizeDocumentInput, input)
  const { document } = await readDocument({ root, project, name })
  return writeDocument({ root, project, name, document: resizeCanvas(document, resolveSize(choice), anchor) })
}

// groupLayers / ungroupLayer --------------------------------------------------

/** A core tree edit's result as an op result: the write, or the core error as an OpError. */
async function writeTreeEdit<Extra>(
  ref: { root: string; project: string; name: string },
  result: TreeEditResult<Extra>,
): Promise<DocumentResult & Extra> {
  if (!result.ok) throw new OpError(result.code, result.message)
  const { ok: _, document, ...extra } = result
  return { ...(await writeDocument({ ...ref, document })), ...(extra as Extra) }
}

const GroupLayersInput = z.object({
  root: Root,
  project: Name,
  name: Name,
  ids: z.array(z.string().min(1)).min(1),
  groupName: z.string().optional(),
})
export type GroupLayersInput = z.input<typeof GroupLayersInput>

/**
 * Wraps Layers sharing a parent in a new Group (core `group`) and writes the
 * Document (as v2). The write is unconditional. Unknown ids are NOT_FOUND,
 * Layers with different parents INVALID_INPUT.
 */
export async function groupLayers(input: GroupLayersInput): Promise<DocumentResult & { id: string }> {
  const { root, project, name, ids, groupName } = parseInput(GroupLayersInput, input)
  const { document } = await readDocument({ root, project, name })
  return writeTreeEdit({ root, project, name }, group(document, ids, groupName === undefined ? {} : { name: groupName }))
}

const UngroupLayerInput = z.object({ root: Root, project: Name, name: Name, id: z.string().min(1) })
export type UngroupLayerInput = z.input<typeof UngroupLayerInput>

/**
 * Puts a Group's children where the Group was (core `ungroup`) and writes the
 * Document. The write is unconditional. An unknown id is NOT_FOUND, a Layer
 * that is not a Group INVALID_INPUT. Answers the former children's `ids`.
 */
export async function ungroupLayer(input: UngroupLayerInput): Promise<DocumentResult & { ids: string[] }> {
  const { root, project, name, id } = parseInput(UngroupLayerInput, input)
  const { document } = await readDocument({ root, project, name })
  return writeTreeEdit({ root, project, name }, ungroup(document, id))
}
