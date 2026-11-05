import { join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { cli } from './cli-harness.ts'
import { tempRoot } from './harness.ts'

async function project() {
  const root = await tempRoot()
  await cli(['project', 'new', 'p', '--root', root])
  await cli(['doc', 'new', 'p', 'hero', '--preset', '1200x628', '--root', root])
  await cli(['doc', 'new', 'p', 'mrec', '--preset', '300x250', '--root', root])
  await cli(['doc', 'new', 'p', 'leader', '--preset', '728x90', '--root', root])
  return { root, exports: join(root, 'p', 'exports') }
}

describe('bannerkit render', () => {
  it('exports every Document as PNG at 1× and lists the files with --json', async () => {
    const { root, exports } = await project()

    const run = await cli(['render', 'p', '--root', root, '--json'])

    expect(run.exitCode).toBe(0)
    expect(run.json()).toEqual({
      ok: true,
      result: {
        project: 'p',
        files: [
          { name: 'hero', path: join(exports, 'hero.1200x628.png'), width: 1200, height: 628, format: 'png', scale: 1 },
          { name: 'leader', path: join(exports, 'leader.728x90.png'), width: 728, height: 90, format: 'png', scale: 1 },
          { name: 'mrec', path: join(exports, 'mrec.300x250.png'), width: 300, height: 250, format: 'png', scale: 1 },
        ],
      },
    })
  })

  it('prints one written path per line without --json', async () => {
    const { root, exports } = await project()

    const run = await cli(['render', 'p', '--doc', 'mrec', '--root', root])

    expect(run.exitCode).toBe(0)
    expect(run.stdout.trim().split('\n')).toEqual([join(exports, 'mrec.300x250.png')])
  })

  it('accepts repeated --doc and --size filters, --format, --scale and --quality', async () => {
    const { root, exports } = await project()

    const run = await cli(
      [
        'render', 'p',
        '--doc', 'hero', '--doc', 'mrec', '--doc', 'leader',
        '--size', '300x250', '--size', '728x90',
        '--format', 'jpg', '--scale', '2', '--quality', '60',
        '--root', root, '--json',
      ],
    )

    expect(run.exitCode).toBe(0)
    const paths = run.json().result.files.map((f: { path: string }) => f.path)
    expect(paths).toEqual([join(exports, 'leader.728x90@2x.jpg'), join(exports, 'mrec.300x250@2x.jpg')])
    const meta = await sharp(paths[1]).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['jpeg', 600, 500])
  })

  it.each([
    [['--size', 'big']],
    [['--scale', 'two']],
    [['--quality', 'high']],
  ])('reports usage errors for %j', async (flags) => {
    const { root } = await project()

    const run = await cli(['render', 'p', ...flags, '--root', root, '--json'])

    expect(run.exitCode).toBe(2)
    expect(run.json()).toMatchObject({ ok: false, error: { code: 'USAGE' } })
  })

  it('surfaces an unsupported format or scale as INVALID_INPUT', async () => {
    const { root } = await project()

    const gif = await cli(['render', 'p', '--format', 'gif', '--root', root, '--json'])
    const triple = await cli(['render', 'p', '--scale', '3', '--root', root, '--json'])

    expect(gif.exitCode).toBe(1)
    expect(gif.json().error.code).toBe('INVALID_INPUT')
    expect(triple.json().error.code).toBe('INVALID_INPUT')
  })

  it('keeps single --size for doc new', async () => {
    const { root } = await project()

    const twice = await cli(['doc', 'new', 'p', 'x', '--size', '10x10', '--size', '20x20', '--root', root, '--json'])
    const once = await cli(['doc', 'new', 'p', 'y', '--size', '10x10', '--root', root, '--json'])

    expect(twice.exitCode).toBe(2)
    expect(once.exitCode).toBe(0)
  })
})
