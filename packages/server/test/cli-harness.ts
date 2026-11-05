import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { main } from '../src/cli/main.ts'
import { repoRoot } from './harness.ts'

export type CliRun = { exitCode: number; stdout: string; stderr: string; json: () => any }

const withJson = (r: Omit<CliRun, 'json'>): CliRun => ({ ...r, json: () => JSON.parse(r.stdout) })

/** Runs the CLI adapter in-process with a controlled env and cwd. */
export async function cli(
  argv: string[],
  { env = {}, cwd = repoRoot }: { env?: Record<string, string>; cwd?: string } = {},
): Promise<CliRun> {
  let stdout = ''
  let stderr = ''
  const exitCode = await main(argv, {
    env,
    cwd,
    stdout: (t) => void (stdout += t),
    stderr: (t) => void (stderr += t),
  })
  return withJson({ exitCode, stdout, stderr })
}

const binPath = join(repoRoot, 'packages/server/bin/bannerkit.js')

/** Runs the real `bannerkit` bin as a child process. Slower; use for smoke tests only. */
export async function cliProcess(
  argv: string[],
  { env = {}, cwd = repoRoot }: { env?: Record<string, string>; cwd?: string } = {},
): Promise<CliRun> {
  try {
    const { stdout, stderr } = await promisify(execFile)(process.execPath, [binPath, ...argv], {
      cwd,
      env: { PATH: process.env.PATH ?? '', ...env },
    })
    return withJson({ exitCode: 0, stdout, stderr })
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string }
    return withJson({ exitCode: typeof e.code === 'number' ? e.code : 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' })
  }
}
