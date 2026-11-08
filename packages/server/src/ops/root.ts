import { resolve } from 'node:path'

export const DEFAULT_PROJECTS_DIR = 'projects'

/**
 * The projects root: an explicit value (e.g. `--root`) wins, then `BANNERKIT_ROOT`,
 * then `./projects`. Relative paths resolve against `cwd`.
 */
export function resolveProjectsRoot({
  root,
  env,
  cwd,
}: {
  root?: string | undefined
  env: Record<string, string | undefined>
  cwd: string
}): string {
  const chosen = root || env.BANNERKIT_ROOT || DEFAULT_PROJECTS_DIR
  return resolve(cwd, chosen)
}
