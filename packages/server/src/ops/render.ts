import { join } from 'node:path'
import {
  DEFAULT_EXPORT_QUALITY,
  EXPORT_FORMATS,
  EXPORT_SCALES,
  SizeSchema,
  exportFileName,
  type Document,
  type ExportFormat,
  type ExportScale,
} from '@bannerkit/core'
import { z } from 'zod'
import { renderDocument } from '../render/renderDocument.ts'
import { listDocuments, readDocument } from './documents.ts'
import { OpError, parseInput } from './errors.ts'
import { writeFileAtomic } from './fs.ts'
import { Name, Root, exportsDir, projectDir } from './paths.ts'

const RenderInput = z.object({
  root: Root,
  project: Name,
  /** Only these Documents (by name). Every name must exist. */
  docs: z.array(Name).optional(),
  /** Only Documents whose Canvas is one of these sizes. */
  sizes: z.array(SizeSchema).optional(),
  format: z.enum(EXPORT_FORMATS).default('png'),
  scale: z.union(EXPORT_SCALES.map((s) => z.literal(s))).default(1),
  quality: z.number().int().min(1).max(100).default(DEFAULT_EXPORT_QUALITY),
})

export type RenderInput = z.input<typeof RenderInput>

export type ExportFile = {
  name: string
  path: string
  /** Pixel dimensions of the written file: Canvas size × scale. */
  width: number
  height: number
  format: ExportFormat
  scale: ExportScale
}

export type RenderResult = { project: string; files: ExportFile[] }

/**
 * Batch Export: renders every Document in a Project (optionally filtered by name
 * and/or Canvas size) into the Project's exports folder. Every selected Document is
 * read and validated before anything is written.
 */
export async function render(input: RenderInput): Promise<RenderResult> {
  const { project } = parseInput(RenderInput, input)
  return { project, files: (await renderExports(input)).map((e) => e.file) }
}

const ExportDocumentInput = RenderInput.omit({ docs: true, sizes: true }).extend({ name: Name })
export type ExportDocumentInput = z.input<typeof ExportDocumentInput>

/**
 * One Document's Export, written like `render` writes it and answered with its
 * encoded bytes too (what the REST render of one Document sends back).
 */
export async function exportDocument(input: ExportDocumentInput): Promise<{ file: ExportFile; image: Uint8Array }> {
  const { name, ...options } = parseInput(ExportDocumentInput, input)
  return (await renderExports({ ...options, docs: [name] }))[0]!
}

/** Renders and writes the selected Documents' Exports; see `render`. */
async function renderExports(input: RenderInput): Promise<{ file: ExportFile; image: Uint8Array }[]> {
  const { root, project, docs, sizes, format, scale, quality } = parseInput(RenderInput, input)
  const available = (await listDocuments({ root, project })).map((d) => d.name)

  const missing = docs?.filter((name) => !available.includes(name)) ?? []
  if (missing.length > 0) {
    throw new OpError(
      'NOT_FOUND',
      `Document(s) not found in Project "${project}": ${missing.join(', ')}`,
      missing.map((name) => ({ path: 'docs', message: `no Document named "${name}"` })),
    )
  }

  const selectedNames = docs ? available.filter((name) => docs.includes(name)) : available
  const documents = await Promise.all(selectedNames.map((name) => readDocument({ root, project, name })))
  const selected = documents.filter(
    ({ document: { canvas } }) => !sizes || sizes.some((s) => s.width === canvas.width && s.height === canvas.height),
  )

  // Render everything before writing, so an Asset that fails to load leaves no partial batch.
  const rendered: { name: string; document: Document; image: Buffer }[] = []
  for (const { name, document } of selected) {
    const image = await renderDocument(document, { format, scale, quality, projectDir: projectDir(root, project) })
    rendered.push({ name, document, image })
  }

  const exports: { file: ExportFile; image: Uint8Array }[] = []
  for (const { name, document, image } of rendered) {
    const path = join(exportsDir(root, project), exportFileName(name, document.canvas, scale, format))
    await writeFileAtomic(path, image)
    const file: ExportFile = { name, path, width: document.canvas.width * scale, height: document.canvas.height * scale, format, scale }
    exports.push({ file, image })
  }
  return exports
}
