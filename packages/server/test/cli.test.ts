import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { cli, cliProcess } from './cli-harness.ts'
import { exists, tempRoot } from './harness.ts'

describe('bannerkit project new', () => {
  it('creates a Project under --root and reports it as JSON', async () => {
    const root = await tempRoot()

    const run = await cli(['project', 'new', 'spring', '--root', root, '--json'])

    expect(run.exitCode).toBe(0)
    expect(run.json()).toEqual({ ok: true, result: { name: 'spring', path: join(root, 'spring') } })
    expect(await exists(join(root, 'spring', 'project.json'))).toBe(true)
  })

  it('prints a human-readable line without --json', async () => {
    const root = await tempRoot()

    const run = await cli(['project', 'new', 'spring', '--root', root])

    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain(join(root, 'spring'))
  })
})

describe('projects root', () => {
  it('falls back to BANNERKIT_ROOT, then ./projects under the cwd', async () => {
    const envRoot = await tempRoot()
    const cwd = await tempRoot()

    await cli(['project', 'new', 'a', '--json'], { env: { BANNERKIT_ROOT: envRoot } })
    await cli(['project', 'new', 'b', '--json'], { cwd })

    expect(await exists(join(envRoot, 'a', 'project.json'))).toBe(true)
    expect(await exists(join(cwd, 'projects', 'b', 'project.json'))).toBe(true)
  })

  it('prefers --root over BANNERKIT_ROOT', async () => {
    const flagRoot = await tempRoot()
    const envRoot = await tempRoot()

    await cli(['project', 'new', 'a', '--root', flagRoot], { env: { BANNERKIT_ROOT: envRoot } })

    expect(await exists(join(flagRoot, 'a'))).toBe(true)
    expect(await exists(join(envRoot, 'a'))).toBe(false)
  })

  it('resolves a relative root against the cwd', async () => {
    const cwd = await tempRoot()

    await cli(['project', 'new', 'a', '--root', 'banners'], { cwd })

    expect(await exists(join(cwd, 'banners', 'a'))).toBe(true)
  })
})

describe('bannerkit doc new / duplicate', () => {
  it('creates a Document from a Preset and duplicates it onto a custom size', async () => {
    const root = await tempRoot()
    await cli(['project', 'new', 'p', '--root', root])

    const created = await cli(['doc', 'new', 'p', 'hero', '--preset', '1200x628', '--root', root, '--json'])
    const copied = await cli(['doc', 'duplicate', 'p', 'hero', '--size', '160x600', '--root', root, '--json'])

    expect(created.exitCode).toBe(0)
    expect(created.json().result).toMatchObject({
      project: 'p',
      name: 'hero',
      path: join(root, 'p', 'documents', 'hero.json'),
      document: { canvas: { width: 1200, height: 628 } },
    })
    expect(copied.exitCode).toBe(0)
    expect(copied.json().result).toMatchObject({ name: 'hero-160x600', document: { canvas: { width: 160, height: 600 } } })
  })

  it('accepts an explicit name for the duplicate', async () => {
    const root = await tempRoot()
    await cli(['project', 'new', 'p', '--root', root])
    await cli(['doc', 'new', 'p', 'hero', '--size', '970x250', '--root', root])

    const run = await cli(['doc', 'duplicate', 'p', 'hero', 'tall', '--preset', '1080x1920', '--root', root, '--json'])

    expect(run.json().result.name).toBe('tall')
  })
})

describe('bannerkit preview', () => {
  it('renders a Preview and prints its path', async () => {
    const root = await tempRoot()
    await cli(['project', 'new', 'p', '--root', root])
    await cli(['doc', 'new', 'p', 'hero', '--preset', '300x250', '--root', root])

    const human = await cli(['preview', 'p', 'hero', '--root', root])
    const json = await cli(['preview', 'p', 'hero', '--root', root, '--json'])

    const path = join(root, 'p', 'exports', '.preview', 'hero.png')
    expect(human.exitCode).toBe(0)
    expect(human.stdout.trim()).toBe(path)
    expect(json.json()).toEqual({ ok: true, result: { project: 'p', name: 'hero', path, width: 300, height: 250 } })
    expect((await sharp(path).metadata()).width).toBe(300)
  })
})

describe('errors', () => {
  it('returns a structured error and a non-zero exit code with --json', async () => {
    const root = await tempRoot()

    const run = await cli(['preview', 'ghost', 'hero', '--root', root, '--json'])

    expect(run.exitCode).not.toBe(0)
    expect(run.json()).toEqual({
      ok: false,
      error: { code: 'NOT_FOUND', message: expect.stringContaining('ghost'), issues: [] },
    })
  })

  it('writes the error to stderr without --json', async () => {
    const root = await tempRoot()

    const run = await cli(['preview', 'ghost', 'hero', '--root', root])

    expect(run.exitCode).not.toBe(0)
    expect(run.stdout).toBe('')
    expect(run.stderr).toContain('ghost')
  })

  it.each([
    [['frobnicate']],
    [['doc', 'new', 'p']],
    [['doc', 'new', 'p', 'd', '--size', 'big']],
    [['project', 'new', 'p', '--bogus']],
  ])('reports usage errors for %j', async (argv) => {
    const root = await tempRoot()

    const run = await cli([...argv, '--root', root, '--json'])

    expect(run.exitCode).toBe(2)
    expect(run.json()).toMatchObject({ ok: false, error: { code: 'USAGE' } })
  })

  it('surfaces invalid op input as INVALID_INPUT', async () => {
    const root = await tempRoot()
    await cli(['project', 'new', 'p', '--root', root])

    const run = await cli(['doc', 'new', 'p', 'd', '--preset', '1x1', '--root', root, '--json'])

    expect(run.exitCode).toBe(1)
    expect(run.json().error.code).toBe('INVALID_INPUT')
  })

  it('prints usage with --help and exits 0', async () => {
    const run = await cli(['--help'])

    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain('bannerkit project new')
  })
})

describe('bannerkit bin', () => {
  it('runs end to end as a process without the server', async () => {
    const root = await tempRoot()

    const created = await cliProcess(['project', 'new', 'p', '--json'], { env: { BANNERKIT_ROOT: root } })
    const failed = await cliProcess(['project', 'new', 'p', '--json'], { env: { BANNERKIT_ROOT: root } })

    expect(created.exitCode).toBe(0)
    expect(created.json().ok).toBe(true)
    expect(JSON.parse(await readFile(join(root, 'p', 'project.json'), 'utf8')).name).toBe('p')
    expect(failed.exitCode).toBe(1)
    expect(failed.json().error.code).toBe('ALREADY_EXISTS')
  }, 30_000)
})
