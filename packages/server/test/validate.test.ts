import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { documentJsonSchema } from '@bannerkit/core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createDocument, createProject, validate, writeDocument } from '../src/ops/index.ts'
import { schemaRefFrom } from '../src/ops/validation.ts'
import { repoRoot, tempRoot } from './harness.ts'

let root: string
beforeEach(async () => {
  root = await tempRoot()
  await createProject({ root, name: 'p' })
})

const docPath = (name: string) => join(root, 'p', 'documents', `${name}.json`)
const readDocFile = async (name: string) => JSON.parse(await readFile(docPath(name), 'utf8'))

const textLayer = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: 'text',
  x: 0,
  y: 0,
  width: 200,
  text: 'Hi',
  fontFamily: 'Inter',
  fontWeight: 700,
  fontSize: 20,
  fill: '#000000',
  ...extra,
})

const docWith = (name: string, layers: unknown[]) => ({
  version: 1,
  name,
  canvas: { width: 300, height: 250, background: null },
  layers,
})

/** Writes a file by hand, the way an agent edits a Document, bypassing the ops layer. */
const handEdit = (name: string, value: unknown) =>
  writeFile(docPath(name), typeof value === 'string' ? value : JSON.stringify(value, null, 2))

describe('validate a Project', () => {
  it('reports every Document, with path-located errors and hints for the broken ones', async () => {
    await createDocument({ root, project: 'p', name: 'good', preset: '300x250' })
    await handEdit('typo', docWith('typo', [{ ...textLayer('text-1'), fontWieght: 700, fontWeight: undefined }]))
    await handEdit('broken', '{ "version": 1,')

    const report = await validate({ root, project: 'p' })

    expect(report.ok).toBe(false)
    expect(report.documents.map((d) => [d.name, d.ok])).toEqual([
      ['broken', false],
      ['good', true],
      ['typo', false],
    ])
    const typo = report.documents.find((d) => d.name === 'typo')!
    expect(typo.path).toBe(docPath('typo'))
    expect(typo.errors).toEqual(
      expect.arrayContaining([
        { path: 'layers[0].fontWieght', message: 'unknown key "fontWieght"', suggestion: 'fontWeight' },
        { path: 'layers[0].fontWeight', message: 'missing; expected 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900' },
      ]),
    )
    const broken = report.documents.find((d) => d.name === 'broken')!
    expect(broken.errors).toEqual([{ path: '', message: expect.stringContaining('not valid JSON') }])
  })

  it('is ok when every Document is valid', async () => {
    await createDocument({ root, project: 'p', name: 'a', preset: '300x250' })
    await createDocument({ root, project: 'p', name: 'b', preset: '728x90' })

    expect(await validate({ root, project: 'p' })).toMatchObject({ ok: true, documents: [{ ok: true }, { ok: true }] })
  })

  it('reports cross-field rules', async () => {
    await handEdit(
      'rules',
      docWith('rules', [textLayer('text-1', { autoFit: { minFontSize: 10 } }), textLayer('text-1')]),
    )

    const [doc] = (await validate({ root, project: 'p' })).documents

    expect(doc!.errors).toEqual([
      { path: 'layers[1].id', message: 'duplicate Layer id "text-1" (also used by layers[0])' },
      { path: 'layers[0].autoFit', message: 'autoFit requires height' },
    ])
  })

  it('rejects font families and weights missing from the font manifest', async () => {
    await handEdit('fonts', docWith('fonts', [textLayer('text-1', { fontFamily: 'Helvetica' })]))

    const [doc] = (await validate({ root, project: 'p' })).documents

    expect(doc!.errors).toEqual([
      { path: 'layers[0].fontFamily', message: 'font family "Helvetica" is not in the font manifest (available: Inter)' },
    ])
  })

  it('warns, without failing, when text overflows its Box at the minimum font size', async () => {
    await handEdit(
      'overflow',
      docWith('overflow', [
        textLayer('text-1', { text: 'Supercalifragilistic', width: 60, height: 40, autoFit: { minFontSize: 12 } }),
        textLayer('text-2', { text: 'one\ntwo\nthree', height: 20 }),
        textLayer('text-3', { text: 'fits', height: 40, autoFit: { minFontSize: 12 } }),
      ]),
    )

    const [doc] = (await validate({ root, project: 'p' })).documents

    expect(doc).toMatchObject({
      ok: true,
      errors: [],
      warnings: [
        { path: 'layers[0].text', message: 'text overflows its Box even at autoFit.minFontSize 12px; it renders clipped' },
        { path: 'layers[1].text', message: 'text overflows its Box at fontSize 20px; it renders clipped' },
      ],
    })
  })

  it('fails with NOT_FOUND for a missing Project', async () => {
    await expect(validate({ root, project: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('validate a single file', () => {
  it('validates the file at a path', async () => {
    await handEdit('one', docWith('one', [textLayer('text-1', { align: 'centre' })]))

    const report = await validate({ file: docPath('one') })

    expect(report).toEqual({
      ok: false,
      documents: [
        {
          project: 'p',
          name: 'one',
          path: docPath('one'),
          ok: false,
          errors: [
            { path: 'layers[0].align', message: 'expected "left" | "center" | "right", got "centre"', suggestion: 'center' },
          ],
          warnings: [],
        },
      ],
    })
  })

  it('fails with NOT_FOUND for a missing file', async () => {
    await expect(validate({ file: docPath('ghost') })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})

describe('writes go through validation', () => {
  it('writeDocument rejects cross-field errors and leaves the file untouched', async () => {
    await createDocument({ root, project: 'p', name: 'hero', preset: '300x250' })
    const before = await readDocFile('hero')

    await expect(
      writeDocument({ root, project: 'p', name: 'hero', document: docWith('hero', [textLayer('a'), textLayer('a')]) }),
    ).rejects.toMatchObject({
      code: 'INVALID_DOCUMENT',
      issues: [{ path: 'layers[1].id', message: 'duplicate Layer id "a" (also used by layers[0])' }],
    })
    expect(await readDocFile('hero')).toEqual(before)
  })

  it('writeDocument carries "did you mean" suggestions in its issues', async () => {
    await expect(
      writeDocument({ root, project: 'p', name: 'hero', document: { ...docWith('hero', []), layer: [] } }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([{ path: 'layer', message: 'unknown key "layer"', suggestion: 'layers' }]),
    })
  })
})

describe('$schema', () => {
  it('Documents created by the CLI ops point at the generated JSON Schema', async () => {
    const { document } = await createDocument({ root, project: 'p', name: 'hero', preset: '300x250' })

    const ref = document.$schema!
    const schemaPath = ref.startsWith('file:') ? fileURLToPath(ref) : resolve(dirname(docPath('hero')), ref)

    expect(JSON.parse(await readFile(schemaPath, 'utf8'))).toEqual(documentJsonSchema())
    expect((await readDocFile('hero')).$schema).toBe(document.$schema)
  })

  it('is a short relative path for the default ./projects root in the repo', async () => {
    expect(schemaRefFrom(join(repoRoot, 'projects', 'p', 'documents'))).toBe(
      '../../../packages/core/schema/document.schema.json',
    )
  })
})
