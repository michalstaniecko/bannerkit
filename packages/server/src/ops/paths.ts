import { join } from 'node:path'
import { z } from 'zod'

/**
 * Project and Document names become directory and file names, so they are
 * restricted to a safe slug: no separators, no leading dot.
 */
export const Name = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/, 'must start with a letter or digit and contain only letters, digits, ".", "_" or "-"')
  .max(100)

export const Root = z.string().min(1)

export const projectDir = (root: string, project: string) => join(root, project)
export const projectFile = (root: string, project: string) => join(root, project, 'project.json')
export const documentsDir = (root: string, project: string) => join(root, project, 'documents')
export const assetsDir = (root: string, project: string) => join(root, project, 'assets')
export const exportsDir = (root: string, project: string) => join(root, project, 'exports')
export const previewsDir = (root: string, project: string) => join(root, project, 'exports', '.preview')
export const documentFile = (root: string, project: string, doc: string) =>
  join(documentsDir(root, project), `${doc}.json`)
/** The editor's Selection, `{ doc, selectedLayerIds }`; git-ignored. */
export const stateFile = (root: string, project: string) => join(root, project, '.state.json')
