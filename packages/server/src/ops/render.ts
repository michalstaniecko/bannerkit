import { join } from 'node:path'
import { SizeSchema, formatSize, type Document } from '@bannerkit/core'
import { z } from 'zod'
import { DEFAULT_QUALITY, RENDER_FORMATS, renderDocument, type RenderFormat } from '../render/renderDocument.ts'
import { listDocuments, readDocument } from './documents.ts'
import { OpError, parseInput } from './errors.ts'
import { writeFileAtomic } from './fs.ts'
import { Name, Root, exportsDir } from './paths.ts'

const RenderInput = z.object({
  root: Root,
  project: Name,
  /** Only these Documents (by name). Every name must exist. */
  docs: z.array(Name).optional(),
  /** Only Documents whose Canvas is one of these sizes. */
  sizes: z.array(SizeSchema).optional(),
  format: z.enum(RENDER_FORMATS).default('png'),
  scale: z.union([z.literal(1), z.literal(2)]).default(1),
  quality: z.number().int().min(1).max(100).default(DEFAULT_QUALITY),
})

export type RenderInput = z.input<typeof RenderInput>

export type ExportFile = {
  name: string
  path: string
  /** Pixel dimensions of the written file: Canvas size × scale. */
  width: number
  height: number
  format: RenderFormat
  scale: 1 | 2
}

export type RenderResult = { project: string; files: ExportFile[] }

/** `<doc>.<w>x<h>[@2x].<ext>`, where w×h is the Canvas size. */
export const exportFileName = (name: string, doc: Document, scale: number, format: RenderFormat) =>
  `${name}.${formatSize(doc.canvas)}${scale === 1 ? '' : `@${scale}x`}.${format}`

/**
 * Batch Export: renders every Document in a Project (optionally filtered by name
 * and/or Canvas size) into the Project's exports folder. Every selected Document is
 * read and validated before anything is written.
 */
export async function render(input: RenderInput): Promise<RenderResult> {
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

  const files: ExportFile[] = []
  for (const { name, document } of selected) {
    const image = await renderDocument(document, { format, scale, quality })
    const path = join(exportsDir(root, project), exportFileName(name, document, scale, format))
    await writeFileAtomic(path, image)
    files.push({
      name,
      path,
      width: document.canvas.width * scale,
      height: document.canvas.height * scale,
      format,
      scale,
    })
  }
  return { project, files }
}
