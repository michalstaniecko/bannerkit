import { join } from 'node:path'
import { z } from 'zod'
import { renderDocument } from '../render/renderDocument.ts'
import { readDocument } from './documents.ts'
import { parseInput } from './errors.ts'
import { writeFileAtomic } from './fs.ts'
import { Name, Root, previewsDir } from './paths.ts'

const PreviewInput = z.object({ root: Root, project: Name, name: Name })

export type PreviewResult = { project: string; name: string; path: string; width: number; height: number }

/** Renders a throwaway PNG of a Document to `exports/.preview/<doc>.png` for an agent to look at. */
export async function preview(input: z.input<typeof PreviewInput>): Promise<PreviewResult> {
  const { root, project, name } = parseInput(PreviewInput, input)
  const { document } = await readDocument({ root, project, name })
  const png = await renderDocument(document, { scale: 1, format: 'png' })
  const path = join(previewsDir(root, project), `${name}.png`)
  await writeFileAtomic(path, png)
  return { project, name, path, width: document.canvas.width, height: document.canvas.height }
}
