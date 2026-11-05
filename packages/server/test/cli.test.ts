import { readFile, writeFile } from 'node:fs/promises'
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

  it('draws image Layers from the Project Assets, and exits 1 naming the Layer when one cannot load', async () => {
    const root = await tempRoot()
    await cli(['project', 'new', 'p', '--root', root])
    const red = join(root, 'red.png')
    await sharp({ create: { width: 4, height: 4, channels: 3, background: '#ff0000' } }).png().toFile(red)
    await cli(['asset', 'add', 'p', red, '--root', root])
    const docPath = join(root, 'p', 'documents', 'hero.json')
    const hero = (src: string) =>
      JSON.stringify({
        version: 1,
        name: 'hero',
        canvas: { width: 20, height: 20, background: '#ffffff' },
        layers: [{ id: 'image-1', type: 'image', x: 0, y: 0, width: 10, height: 20, src, fit: 'stretch' }],
      })
    await writeFile(docPath, hero('assets/red.png'))

    const ok = await cli(['preview', 'p', 'hero', '--root', root, '--json'])
    expect(ok.exitCode).toBe(0)
    const { data } = await sharp(ok.json().result.path).raw().toBuffer({ resolveWithObject: true })
    expect([...data.subarray(0, 3)]).toEqual([255, 0, 0])

    // The file exists, so validation passes, but it cannot be decoded.
    await writeFile(join(root, 'p', 'assets', 'red.png'), 'not a png')
    const broken = await cli(['preview', 'p', 'hero', '--root', root, '--json'])
    expect(broken.exitCode).toBe(1)
    expect(broken.json()).toEqual({
      ok: false,
      error: {
        code: 'RENDER_FAILED',
        message: expect.stringMatching(/"image-1".*"assets\/red\.png"/),
        issues: [{ path: 'layers[0].src', message: expect.any(String) }],
      },
    })
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

describe('bannerkit validate', () => {
  const setup = async () => {
    const root = await tempRoot()
    await cli(['project', 'new', 'p', '--root', root])
    await cli(['doc', 'new', 'p', 'good', '--preset', '300x250', '--root', root])
    const bad = join(root, 'p', 'documents', 'bad.json')
    await writeFile(
      bad,
      JSON.stringify({
        version: 1,
        name: 'bad',
        canvas: { width: 300, height: 250, background: null },
        layers: [{ id: 'rect-1', type: 'rect', x: 0, y: 0, width: 10, height: 10, fill: '#000', opactiy: 0.5 }],
      }),
    )
    return { root, bad }
  }

  it('exits 0 and says so when a Project is valid', async () => {
    const root = await tempRoot()
    await cli(['project', 'new', 'p', '--root', root])
    await cli(['doc', 'new', 'p', 'good', '--preset', '300x250', '--root', root])

    const run = await cli(['validate', 'p', '--root', root])

    expect(run.exitCode).toBe(0)
    expect(run.stdout).toContain('1 Document(s) valid')
  })

  it('prints path-located errors with hints and exits non-zero', async () => {
    const { root, bad } = await setup()

    const run = await cli(['validate', 'p', '--root', root])

    expect(run.exitCode).toBe(1)
    expect(run.stdout).toContain(bad)
    expect(run.stdout).toContain('layers[0].opactiy: unknown key "opactiy" (did you mean "opacity"?)')
  })

  it('reports structured results with --json', async () => {
    const { root, bad } = await setup()

    const run = await cli(['validate', 'p', '--root', root, '--json'])

    expect(run.exitCode).toBe(1)
    expect(run.json()).toEqual({
      ok: false,
      result: {
        ok: false,
        documents: [
          {
            project: 'p',
            name: 'bad',
            path: bad,
            ok: false,
            errors: [{ path: 'layers[0].opactiy', message: 'unknown key "opactiy"', suggestion: 'opacity' }],
            warnings: [],
          },
          expect.objectContaining({ name: 'good', ok: true }),
        ],
      },
    })
  })

  it('validates a single file given as a path relative to the cwd', async () => {
    const { root } = await setup()

    const run = await cli(['validate', 'p/documents/good.json', '--json'], { cwd: root })

    expect(run.exitCode).toBe(0)
    expect(run.json().result.documents).toEqual([expect.objectContaining({ name: 'good', ok: true })])
  })
})

describe('bannerkit asset add', () => {
  const setup = async () => {
    const root = await tempRoot()
    const inbox = await tempRoot()
    await cli(['project', 'new', 'p', '--root', root])
    const shoe = join(inbox, 'Shoe Photo.png')
    await writeFile(shoe, await sharp({ create: { width: 30, height: 20, channels: 3, background: '#cc6633' } }).png().toBuffer())
    const logo = join(inbox, 'logo.svg')
    await writeFile(logo, '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="16"/>')
    return { root, inbox, shoe, logo }
  }

  it('prints each Asset src with its dimensions', async () => {
    const { root, inbox } = await setup()

    const run = await cli(['asset', 'add', 'p', 'Shoe Photo.png', 'logo.svg', '--root', root], { cwd: inbox })

    expect(run.exitCode).toBe(0)
    expect(run.stdout).toBe('assets/shoe-photo.png 30x20\nassets/logo.svg 64x16\n')
  })

  it('reports the Assets as JSON', async () => {
    const { root, shoe, logo } = await setup()

    const run = await cli(['asset', 'add', 'p', shoe, logo, '--root', root, '--json'])

    expect(run.json()).toEqual({
      ok: true,
      result: {
        project: 'p',
        assets: [
          { src: 'assets/shoe-photo.png', path: join(root, 'p', 'assets', 'shoe-photo.png'), format: 'png', width: 30, height: 20 },
          { src: 'assets/logo.svg', path: join(root, 'p', 'assets', 'logo.svg'), format: 'svg', width: 64, height: 16 },
        ],
      },
    })
  })

  it('fails clearly for an unsupported or missing file', async () => {
    const { root, inbox } = await setup()
    const notes = join(inbox, 'notes.txt')
    await writeFile(notes, 'hello')

    const unsupported = await cli(['asset', 'add', 'p', notes, '--root', root, '--json'])
    const missing = await cli(['asset', 'add', 'p', join(inbox, 'ghost.png'), '--root', root])

    expect(unsupported.exitCode).toBe(1)
    expect(unsupported.json().error).toMatchObject({ code: 'UNSUPPORTED_ASSET', message: expect.stringContaining('notes.txt') })
    expect(missing.exitCode).toBe(1)
    expect(missing.stderr).toBe(`error: File ${join(inbox, 'ghost.png')} not found\n`)
  })

  it('needs at least one file', async () => {
    const { root } = await setup()

    expect((await cli(['asset', 'add', 'p', '--root', root])).exitCode).toBe(2)
  })
})
