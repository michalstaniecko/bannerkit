// The `bannerkit` CLI: a thin adapter over the operations layer (ADR 0005).
// It parses argv, calls one op, and formats the result. It never touches the
// filesystem itself, and it returns an exit code instead of calling process.exit.
import { isAbsolute, resolve } from 'node:path'
import { parseArgs, type ParseArgsConfig } from 'node:util'
import {
  EXPORT_FORMATS,
  EXPORT_SCALES,
  isExportFormat,
  isExportScale,
  parseSize,
  type ExportFormat,
  type ExportScale,
  type Issue,
  type PresetId,
  type Size,
} from '@bannerkit/core'
import {
  OpError,
  addAssets,
  createDocument,
  createProject,
  duplicateDocument,
  inspect,
  preview,
  render,
  resolveProjectsRoot,
  type RenderResult,
  validate,
  type AddAssetsResult,
  type InspectResult,
  type ValidateResult,
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
type Values = Record<string, string | string[] | boolean | undefined>
type Context = { root: string; cwd: string; args: string[]; values: Values }

type Command = {
  usage: string
  summary: string
  /** Required positional count, then the maximum. */
  positionals: [min: number, max: number]
  options: Options
  run: (ctx: Context) => Promise<unknown>
  human: (result: any) => string
  /**
   * For commands whose result is a report (e.g. validate): true when the report
   * describes a failure. The result is still printed, the envelope says
   * `ok: false` and the exit code is EXIT_ERROR.
   */
  failed?: (result: any) => boolean
}

class UsageError extends Error {}

const GLOBAL_OPTIONS: Options = {
  root: { type: 'string' },
  json: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
}

// --size is repeatable (render filters by several sizes); commands that take one size reject repeats.
const SIZE_OPTIONS: Options = {
  preset: { type: 'string' },
  size: { type: 'string', multiple: true },
}

const RENDER_OPTIONS: Options = {
  doc: { type: 'string', multiple: true },
  size: { type: 'string', multiple: true },
  format: { type: 'string' },
  scale: { type: 'string' },
  quality: { type: 'string' },
}

function parseSizeFlag(text: string): Size {
  const size = parseSize(text)
  if (!size) throw new UsageError(`--size must look like WxH (e.g. 970x250), got "${text}"`)
  return size
}

function sizeChoice(values: Values): { preset?: PresetId; size?: Size } {
  const preset = values.preset as string | undefined
  const sizes = (values.size as string[] | undefined) ?? []
  if (sizes.length > 1) throw new UsageError('give --size once')
  if ((preset === undefined) === (sizes.length === 0)) throw new UsageError('give exactly one of --preset or --size')
  if (preset !== undefined) return { preset: preset as PresetId }
  return { size: parseSizeFlag(sizes[0]!) }
}

/** A numeric flag; range and allowed values are checked by the op. */
function intFlag(values: Values, name: string): number | undefined {
  const text = values[name] as string | undefined
  if (text === undefined) return undefined
  if (!/^\d+$/.test(text)) throw new UsageError(`--${name} must be a whole number, got "${text}"`)
  return Number(text)
}

/**
 * `--format`, when given, as an ExportFormat. Anything else is the op's INVALID_INPUT
 * (exit 1), the same error `render` gives for an unsupported format.
 */
function formatFlag(values: Values): ExportFormat | undefined {
  const text = values.format as string | undefined
  if (text === undefined || isExportFormat(text)) return text
  throw new OpError('INVALID_INPUT', `format: expected one of ${EXPORT_FORMATS.join(', ')}, got "${text}"`, [
    { path: 'format', message: `expected one of ${EXPORT_FORMATS.join(', ')}` },
  ])
}

/** `--scale`, when given, as an ExportScale: not a whole number is a usage error, an unsupported one INVALID_INPUT. */
function scaleFlag(values: Values): ExportScale | undefined {
  const scale = intFlag(values, 'scale')
  if (scale === undefined || isExportScale(scale)) return scale
  throw new OpError('INVALID_INPUT', `scale: expected ${EXPORT_SCALES.join(' or ')}, got ${scale}`, [
    { path: 'scale', message: `expected ${EXPORT_SCALES.join(' or ')}` },
  ])
}

/** One issue as a human-readable line: `path: message (did you mean "x"?)`. */
const issueLine = (issue: Issue) =>
  `${issue.path || '(root)'}: ${issue.message}${issue.suggestion === undefined ? '' : ` (did you mean "${issue.suggestion}"?)`}`

/** A `validate` target is a file when it looks like a path, otherwise a Project name. */
const looksLikeFile = (target: string) => target.endsWith('.json') || target.includes('/') || target.includes('\\')

function validateReport(report: ValidateResult): string {
  const lines: string[] = []
  for (const doc of report.documents) {
    if (doc.ok && doc.warnings.length === 0) continue
    lines.push(`${doc.path}: ${doc.errors.length} error(s), ${doc.warnings.length} warning(s)`)
    for (const issue of doc.errors) lines.push(`  error ${issueLine(issue)}`)
    for (const issue of doc.warnings) lines.push(`  warning ${issueLine(issue)}`)
  }
  const invalid = report.documents.filter((d) => !d.ok).length
  lines.push(
    invalid === 0
      ? `ok: ${report.documents.length} Document(s) valid`
      : `${invalid} of ${report.documents.length} Document(s) invalid`,
  )
  return lines.join('\n')
}

const px = (n: number) => `${Math.round(n * 100) / 100}`

function inspectReport(r: InspectResult): string {
  const lines = [`${r.name} ${r.canvas.width}x${r.canvas.height} (${r.path})`]
  lines.push(r.selection ? `Selection: ${r.selection.selectedLayerIds.join(', ') || '(none)'}` : 'Selection: not recorded')
  for (const l of r.layers) {
    const b = l.extent
    lines.push(
      `${l.selected ? '*' : ' '} [${l.index}] ${l.type} ${l.id} at ${px(b.x)},${px(b.y)} ${px(b.width)}x${px(b.height)} ${l.placement}`,
    )
    if (l.text) {
      const t = l.text
      const size = t.fontSize === t.requestedFontSize ? `${t.fontSize}px` : `${t.fontSize}px (AutoFit from ${t.requestedFontSize}px)`
      const text = t.lines.map((line) => JSON.stringify(line.text)).join(' / ')
      lines.push(`      ${size}, ${t.lines.length} line(s): ${text}${t.overflow ? ' OVERFLOW' : ''}`)
    }
    if (l.asset) lines.push(`      asset ${l.asset.src} ${l.asset.width}x${l.asset.height}`)
  }
  for (const issue of r.warnings) lines.push(`warning ${issueLine(issue)}`)
  return lines.join('\n')
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
  'asset add': {
    usage: 'bannerkit asset add <project> <files...>',
    summary: 'Ingest PNG, JPEG, WebP or SVG files into assets/ and print each src and size',
    positionals: [2, Infinity],
    options: {},
    run: ({ root, cwd, args: [project, ...paths] }) =>
      addAssets({ root, project: project!, files: paths.map((p) => ({ path: resolve(cwd, p) })) }),
    human: (r: AddAssetsResult) => r.assets.map((a) => `${a.src} ${a.width}x${a.height}`).join('\n'),
  },
  validate: {
    usage: 'bannerkit validate <project | path/to/doc.json>',
    summary: 'Check Documents against the schema and rules; prints path-located errors and exits 1 if any',
    positionals: [1, 1],
    options: {},
    run: ({ root, cwd, args: [target] }) =>
      looksLikeFile(target!)
        ? validate({ file: isAbsolute(target!) ? target! : resolve(cwd, target!) })
        : validate({ root, project: target! }),
    human: validateReport,
    failed: (r: ValidateResult) => !r.ok,
  },
  inspect: {
    usage: 'bannerkit inspect <project> [<doc>]',
    summary:
      'Show each Layer with resolved Text Layout, Asset sizes, extent and Canvas placement, warnings and the Selection (doc defaults to the selected one; * marks selected Layers)',
    positionals: [1, 2],
    options: {},
    run: ({ root, args: [project, name] }) => inspect({ root, project: project!, ...(name ? { name } : {}) }),
    human: inspectReport,
  },
  preview: {
    usage: 'bannerkit preview <project> <doc>',
    summary: 'Render a Preview PNG to exports/.preview/<doc>.png and print its path',
    positionals: [2, 2],
    options: {},
    run: ({ root, args: [project, name] }) => preview({ root, project: project!, name: name! }),
    human: (r) => r.path,
  },
  render: {
    usage: 'bannerkit render <project> [--doc <name> ...] [--size WxH ...] [--format png|jpg|webp] [--scale 1|2] [--quality N]',
    summary: 'Export Documents to exports/<doc>.<w>x<h>[@2x].<ext> (default: all, PNG, 1x, quality 90)',
    positionals: [1, 1],
    options: RENDER_OPTIONS,
    run: ({ root, args: [project], values }) =>
      render({
        root,
        project: project!,
        docs: values.doc as string[] | undefined,
        sizes: (values.size as string[] | undefined)?.map(parseSizeFlag),
        format: formatFlag(values),
        scale: scaleFlag(values),
        quality: intFlag(values, 'quality'),
      }),
    human: (r: RenderResult) =>
      r.files.length === 0 ? 'No Documents matched; nothing exported' : r.files.map((f) => f.path).join('\n'),
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
    '  --json         Print { ok, result } or { ok: false, error } as JSON on stdout',
    '                 (validate prints { ok: false, result } when Documents are invalid)',
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
      for (const issue of issues as Issue[]) {
        io.stderr(`  ${issueLine(issue)}\n`)
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
    const result = await command.run({ root, cwd: io.cwd, args, values })
    const ok = !command.failed?.(result)

    io.stdout(wantsJson ? `${JSON.stringify({ ok, result })}\n` : `${command.human(result)}\n`)
    return ok ? EXIT_OK : EXIT_ERROR
  } catch (error) {
    if (error instanceof UsageError) return fail('USAGE', error.message, [], EXIT_USAGE)
    if (error instanceof OpError) return fail(error.code, error.message, error.issues, EXIT_ERROR)
    return fail('INTERNAL', (error as Error)?.stack ?? String(error), [], EXIT_ERROR)
  }
}
