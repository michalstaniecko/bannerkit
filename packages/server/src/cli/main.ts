// The `bannerkit` CLI: a thin adapter over the operations layer (ADR 0005).
// It parses argv, calls one op, and formats the result. It never touches the
// filesystem itself, and it returns an exit code instead of calling process.exit.
import { parseArgs, type ParseArgsConfig } from 'node:util'
import { parseSize, type PresetId, type Size } from '@bannerkit/core'
import {
  OpError,
  createDocument,
  createProject,
  duplicateDocument,
  preview,
  resolveProjectsRoot,
} from '../ops/index.ts'

export type CliIO = {
  env: Record<string, string | undefined>
  cwd: string
  stdout: (text: string) => void
  stderr: (text: string) => void
}

export const EXIT_OK = 0
export const EXIT_ERROR = 1
export const EXIT_USAGE = 2

type Options = NonNullable<ParseArgsConfig['options']>
type Values = Record<string, string | boolean | undefined>
type Context = { root: string; args: string[]; values: Values }

type Command = {
  usage: string
  summary: string
  /** Required positional count, then the maximum. */
  positionals: [min: number, max: number]
  options: Options
  run: (ctx: Context) => Promise<unknown>
  human: (result: any) => string
}

class UsageError extends Error {}

const GLOBAL_OPTIONS: Options = {
  root: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
}

const SIZE_OPTIONS: Options = {
  preset: { type: 'string' },
  size: { type: 'string' },
}

function sizeChoice(values: Values): { preset?: PresetId; size?: Size } {
  const preset = values.preset as string | undefined
  const sizeText = values.size as string | undefined
  if ((preset === undefined) === (sizeText === undefined)) throw new UsageError('give exactly one of --preset or --size')
  if (preset !== undefined) return { preset: preset as PresetId }
  const size = parseSize(sizeText!)
  if (!size) throw new UsageError(`--size must look like WxH (e.g. 970x250), got "${sizeText}"`)
  return { size }
}

const COMMANDS: Record<string, Command> = {
  'project new': {
    usage: 'bannerkit project new <name>',
    summary: 'Create a Project with documents/, assets/ and exports/',
    positionals: [1, 1],
    options: {},
    run: ({ root, args: [name] }) => createProject({ root, name: name! }),
    human: (r) => `Created Project ${r.name} at ${r.path}`,
  },
  'doc new': {
    usage: 'bannerkit doc new <project> <name> (--preset WxH | --size WxH)',
    summary: 'Create an empty Document from a Preset or a custom size',
    positionals: [2, 2],
    options: SIZE_OPTIONS,
    run: ({ root, args: [project, name], values }) =>
      createDocument({ root, project: project!, name: name!, ...sizeChoice(values) }),
    human: (r) => `Created Document ${r.name} (${r.document.canvas.width}x${r.document.canvas.height}) at ${r.path}`,
  },
  'doc duplicate': {
    usage: 'bannerkit doc duplicate <project> <from> [<name>] (--preset WxH | --size WxH)',
    summary: 'Copy a Document onto another size with its Layers unchanged (name defaults to <from>-<W>x<H>)',
    positionals: [2, 3],
    options: SIZE_OPTIONS,
    run: ({ root, args: [project, from, name], values }) =>
      duplicateDocument({ root, project: project!, from: from!, ...(name ? { name } : {}), ...sizeChoice(values) }),
    human: (r) => `Created Document ${r.name} (${r.document.canvas.width}x${r.document.canvas.height}) at ${r.path}`,
  },
  preview: {
    usage: 'bannerkit preview <project> <doc>',
    summary: 'Render a Preview PNG to exports/.preview/<doc>.png and print its path',
    positionals: [2, 2],
    options: {},
    run: ({ root, args: [project, name] }) => preview({ root, project: project!, name: name! }),
    human: (r) => r.path,
  },
}

const ALL_OPTIONS: Options = Object.assign({}, GLOBAL_OPTIONS, ...Object.values(COMMANDS).map((c) => c.options))

function helpText(): string {
  const lines = [
    'Usage: bannerkit <command> [options]',
    '',
    'Commands:',
    ...Object.values(COMMANDS).map((c) => `  ${c.usage}\n      ${c.summary}`),
    '',
    'Global options:',
    '  --root <dir>   Projects root (default: $BANNERKIT_ROOT, then ./projects)',
    '  --json         Print { ok, result } or { ok, error } as JSON on stdout',
    '  -h, --help     Show this help',
    '',
    'Exit codes: 0 success, 1 operation error, 2 usage error.',
  ]
  return `${lines.join('\n')}\n`
}

function findCommand(positionals: string[]): { key: string; command: Command } | undefined {
  for (const words of [2, 1]) {
    const key = positionals.slice(0, words).join(' ')
    const command = COMMANDS[key]
    if (command && positionals.length >= words) return { key, command }
  }
  return undefined
}

export async function main(argv: string[], io: CliIO): Promise<number> {
  const wantsJson = argv.includes('--json')
  const fail = (code: string, message: string, issues: unknown[], exit: number) => {
    if (wantsJson) io.stdout(`${JSON.stringify({ ok: false, error: { code, message, issues } })}\n`)
    else {
      io.stderr(`error: ${message}\n`)
      for (const issue of issues as { path: string; message: string }[]) {
        io.stderr(`  ${issue.path || '(root)'}: ${issue.message}\n`)
      }
    }
    return exit
  }

  try {
    let parsed: { values: Values; positionals: string[] }
    try {
      parsed = parseArgs({ args: argv, options: ALL_OPTIONS, allowPositionals: true, strict: true }) as typeof parsed
    } catch (error) {
      throw new UsageError((error as Error).message)
    }
    const { values, positionals } = parsed

    if (values.help || positionals.length === 0) {
      io.stdout(helpText())
      return values.help ? EXIT_OK : EXIT_USAGE
    }

    const found = findCommand(positionals)
    if (!found) throw new UsageError(`unknown command "${positionals.join(' ')}"; run bannerkit --help`)
    const { key, command } = found

    const allowed = new Set([...Object.keys(GLOBAL_OPTIONS), ...Object.keys(command.options)])
    const stray = Object.keys(values).find((k) => !allowed.has(k))
    if (stray) throw new UsageError(`option --${stray} is not accepted by "${key}"`)

    const args = positionals.slice(key.split(' ').length)
    const [min, max] = command.positionals
    if (args.length < min || args.length > max) throw new UsageError(`usage: ${command.usage}`)

    const root = resolveProjectsRoot({ root: values.root as string | undefined, env: io.env, cwd: io.cwd })
    const result = await command.run({ root, args, values })

    io.stdout(wantsJson ? `${JSON.stringify({ ok: true, result })}\n` : `${command.human(result)}\n`)
    return EXIT_OK
  } catch (error) {
    if (error instanceof UsageError) return fail('USAGE', error.message, [], EXIT_USAGE)
    if (error instanceof OpError) return fail(error.code, error.message, error.issues, EXIT_ERROR)
    return fail('INTERNAL', (error as Error)?.stack ?? String(error), [], EXIT_ERROR)
  }
}
