import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import { OpError, parseInput } from './errors.ts'
import { pathExists, writeJsonAtomic } from './fs.ts'
import { Name, Root, documentFile, stateFile } from './paths.ts'
import { requireProject } from './store.ts'

// The editor's Selection, recorded per Project in `.state.json` (git-ignored) so
// an agent can act on "what I selected". Adapter-agnostic: the CLI's inspect and
// REST both go through these ops.

const SelectionSchema = z.object({ doc: Name, selectedLayerIds: z.array(z.string().min(1)) })

/** The Document open in the editor and the ids of its selected Layers (empty: nothing selected). */
export type Selection = z.infer<typeof SelectionSchema>

const ReadSelectionInput = z.object({ root: Root, project: Name })

/**
 * The recorded Selection, or null when none is. A `.state.json` that is not a
 * valid Selection is scratch state the editor will overwrite, so it reads as null.
 */
export async function readSelection(input: z.input<typeof ReadSelectionInput>): Promise<Selection | null> {
  const { root, project } = parseInput(ReadSelectionInput, input)
  await requireProject(root, project)
  let text: string
  try {
    text = await readFile(stateFile(root, project), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
  try {
    const parsed = SelectionSchema.safeParse(JSON.parse(text))
    return parsed.success ? { doc: parsed.data.doc, selectedLayerIds: parsed.data.selectedLayerIds } : null
  } catch {
    return null
  }
}

const WriteSelectionInput = z.object({ root: Root, project: Name, ...SelectionSchema.shape })

/**
 * Records the Selection, replacing any previous one. The Document must exist;
 * Layer ids are not checked against it, since the editor may hold unsaved Layers.
 */
export async function writeSelection(input: z.input<typeof WriteSelectionInput>): Promise<Selection> {
  const { root, project, doc, selectedLayerIds } = parseInput(WriteSelectionInput, input)
  await requireProject(root, project)
  if (!(await pathExists(documentFile(root, project, doc)))) {
    throw new OpError('NOT_FOUND', `Document "${doc}" not found in Project "${project}"`)
  }
  const selection: Selection = { doc, selectedLayerIds }
  await writeJsonAtomic(stateFile(root, project), selection)
  return selection
}
