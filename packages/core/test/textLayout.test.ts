import { describe, expect, it } from 'vitest'
import { layoutText, textOverflow, validateDocument, type MeasureText, type TextLayer } from '../src/index.ts'

/**
 * A monospace stand-in for a canvas: every grapheme (space included) advances
 * size / 2 px, and letterSpacing is added after every grapheme, last one
 * included, the way canvas `ctx.letterSpacing` measures.
 */
const mono: MeasureText = (font, text, letterSpacing) => [...text].length * (font.size / 2 + letterSpacing)

const text = (overrides: Partial<TextLayer> = {}): TextLayer => ({
  id: 'text-1',
  type: 'text',
  x: 0,
  y: 0,
  width: 100,
  text: '',
  fontFamily: 'Inter',
  fontWeight: 400,
  fontSize: 20, // 10 px per grapheme with `mono`
  lineHeight: 1,
  fill: '#000000',
  ...overrides,
})

const lines = (overrides: Partial<TextLayer>) => layoutText(text(overrides), mono).lines.map((l) => l.text)

describe('layoutText: wrapping (Fabric Textbox rules)', () => {
  // Box width 100 = 10 graphemes at 10 px.
  it.each([
    ['wraps greedily at the Box width', 'Hello world', 100, ['Hello', 'world']],
    ['keeps a line that fits exactly (strict >)', 'abcd efghi', 100, ['abcd efghi']],
    ['keeps every word that fits on the line', 'a b c d e f g', 100, ['a b c d e', 'f g']],
    ['keeps explicit newlines and empty lines', 'line1\nline2\n\nline4', 100, ['line1', 'line2', '', 'line4']],
    ['treats \\r\\n as one newline', 'one\r\ntwo', 100, ['one', 'two']],
    ['consumes only the break space; the others stay', 'Hello   world', 100, ['Hello  ', 'world']],
    ['keeps a trailing space that fits', 'Hello world ', 120, ['Hello world ']],
    ['moves a trailing space that does not fit to an empty line', 'Hello world ', 110, ['Hello world', '']],
    ['keeps leading spaces', ' leading space here and there', 90, [' leading', 'space', 'here and', 'there']],
    ['re-joins words split on tabs with plain spaces', 'a\tb c', 100, ['a b c']],
    ['yields one empty line for empty text', '', 100, ['']],
    ['never splits an over-long word', 'Supercalifragilistic', 100, ['Supercalifragilistic']],
    [
      'wraps every line at the over-long word width, like Fabric',
      'Supercalifragilistic\nshort words here',
      100,
      ['Supercalifragilistic', 'short words here'],
    ],
  ])('%s', (_name, value, width, expected) => {
    expect(lines({ text: value, width })).toEqual(expected)
  })

  it('applies letterSpacing to every grapheme except the last of a line', () => {
    // "Hello world" = 11 graphemes × 12 px - 2 px = 130 px.
    expect(lines({ text: 'Hello world', letterSpacing: 2, width: 130 })).toEqual(['Hello world'])
    expect(lines({ text: 'Hello world', letterSpacing: 2, width: 129 })).toEqual(['Hello', 'world'])
    expect(layoutText(text({ text: 'Hello world', letterSpacing: 2, width: 130 }), mono).lines[0]!.width).toBe(130)
  })

  it('passes the layer font and letterSpacing to measure', () => {
    const calls: unknown[] = []
    layoutText(text({ text: 'Hi', fontFamily: 'Inter', fontWeight: 700, fontSize: 30, letterSpacing: 1.5 }), (font, t, ls) => {
      calls.push([font, ls])
      return t.length
    })
    expect(calls).toContainEqual([{ family: 'Inter', weight: 700, style: 'normal', size: 30 }, 1.5])
  })

  it('measures an italic Layer with the italic face', () => {
    const styles = new Set<string>()
    layoutText(text({ text: 'Hi there', fontStyle: 'italic' }), (font, t, ls) => {
      styles.add(font.style)
      return mono(font, t, ls)
    })
    expect([...styles]).toEqual(['italic'])
  })
})

describe('layoutText: AutoFit', () => {
  const fit = (overrides: Partial<TextLayer>) => {
    const { fontSize, overflow, lines } = layoutText(text(overrides), mono)
    return { fontSize, overflow, lines: lines.map((l) => l.text) }
  }

  it('keeps fontSize when the text already fits', () => {
    expect(fit({ text: 'Hello', height: 30, autoFit: { minFontSize: 10 } })).toEqual({
      fontSize: 20,
      overflow: false,
      lines: ['Hello'],
    })
  })

  it('shrinks in 1px steps until the wrapped text fits the Box height', () => {
    // 20px: 2 lines, 45.2 tall. 19px: 104.5 wide, still 2 lines. 18px: 99 wide, 1 line, 20.34 tall.
    expect(fit({ text: 'Hello world', height: 30, autoFit: { minFontSize: 10 } })).toEqual({
      fontSize: 18,
      overflow: false,
      lines: ['Hello world'],
    })
  })

  it('shrinks an over-long word instead of splitting it', () => {
    // 20 graphemes fit 100 px at 10px (5 px each).
    expect(fit({ text: 'Supercalifragilistic', height: 100, autoFit: { minFontSize: 5 } })).toEqual({
      fontSize: 10,
      overflow: false,
      lines: ['Supercalifragilistic'],
    })
  })

  it('steps from a fractional fontSize and stops at minFontSize', () => {
    // 20.5, 19.5, ... 10.5 are too wide; 9.5 is the next 1px step.
    expect(fit({ text: 'Supercalifragilistic', fontSize: 20.5, height: 100, autoFit: { minFontSize: 9 } }).fontSize).toBe(9.5)
    // 10.5 is too wide and the next step (9.5) is below the minimum, so minFontSize is tried last.
    expect(fit({ text: 'Supercalifragilistic', fontSize: 20.5, height: 100, autoFit: { minFontSize: 10 } }).fontSize).toBe(10)
  })

  it('reports overflow at minFontSize and keeps the minimum size', () => {
    expect(fit({ text: 'Supercalifragilistic', height: 100, autoFit: { minFontSize: 12 } })).toEqual({
      fontSize: 12,
      overflow: true,
      lines: ['Supercalifragilistic'],
    })
    expect(fit({ text: 'a\nb\nc', height: 30, autoFit: { minFontSize: 15 } })).toMatchObject({ fontSize: 15, overflow: true })
  })

  it('reports overflow without AutoFit when the text is taller or a word is wider than the Box', () => {
    expect(fit({ text: 'a\nb', height: 30 }).overflow).toBe(true)
    expect(fit({ text: 'Supercalifragilistic' }).overflow).toBe(true)
    // Without a height the Box grows with the text.
    expect(fit({ text: 'a\nb\nc\nd' }).overflow).toBe(false)
  })
})

describe('textOverflow rule', () => {
  const manifest = [{ family: 'Inter', weight: 400 as const, style: 'normal' as const, file: 'Inter-Regular.ttf' }]
  const doc = (layers: TextLayer[]) => ({ version: 1, name: 'd', canvas: { width: 100, height: 100, background: null }, layers })

  it('warns for overflowing text Layers and skips fonts outside the manifest', () => {
    const result = validateDocument(
      doc([
        text({ id: 'a', text: 'Supercalifragilistic', height: 50, autoFit: { minFontSize: 12 } }),
        text({ id: 'b', text: 'fits' }),
        text({ id: 'c', text: 'Supercalifragilistic', fontWeight: 700 }),
      ]),
      { rules: [textOverflow(manifest, mono)] },
    )
    expect(result).toMatchObject({
      ok: true,
      warnings: [{ path: 'layers[0].text', message: 'text overflows its Box even at autoFit.minFontSize 12px; it renders clipped' }],
    })
  })
})

describe('layoutText: positions (Fabric vertical model)', () => {
  const close = (actual: number[], expected: number[]) =>
    expected.forEach((v, i) => expect(actual[i], `[${i}]`).toBeCloseTo(v, 6))
  const at = (overrides: Partial<TextLayer>) => layoutText(text({ text: 'Hello world', ...overrides }), mono)

  it('puts baselines at i × size × 1.13 × lineHeight + size × 1.13 × 0.778 from the top', () => {
    const layout = at({ lineHeight: 1.5 })
    // 20 × 1.13 × 1.5 = 33.9; 20 × 1.13 × 0.778 = 17.5828.
    close(
      layout.lines.map((l) => l.baselineY),
      [17.5828, 51.4828],
    )
    // Without a height the Box is as tall as the text block: 33.9 + 22.6.
    expect(layout.height).toBeCloseTo(56.5, 6)
  })

  it('defaults lineHeight to Fabric Textbox 1.16', () => {
    // 20 × 1.13 × 1.16 = 26.216.
    close(
      at({ lineHeight: undefined }).lines.map((l) => l.baselineY),
      [17.5828, 43.7988],
    )
  })

  it('honours verticalAlign within the Box height', () => {
    // Text block 56.5 tall in a 100 px Box.
    close(at({ lineHeight: 1.5, height: 100, verticalAlign: 'top' }).lines.map((l) => l.baselineY), [17.5828])
    close(at({ lineHeight: 1.5, height: 100, verticalAlign: 'middle' }).lines.map((l) => l.baselineY), [39.3328])
    close(at({ lineHeight: 1.5, height: 100, verticalAlign: 'bottom' }).lines.map((l) => l.baselineY), [61.0828])
  })

  it('honours align with each line measured whole, trailing spaces included', () => {
    const x = (align: TextLayer['align'], value = 'Hello world') =>
      layoutText(text({ text: value, align, width: 120 }), mono).lines.map((l) => [l.x, l.width])
    expect(x(undefined)).toEqual([[0, 110]])
    expect(x('left')).toEqual([[0, 110]])
    expect(x('center')).toEqual([[5, 110]])
    expect(x('right')).toEqual([[10, 110]])
    expect(x('right', 'Hello ')).toEqual([[60, 60]])
  })

  it('aligns over-long text within the widened Box, like Fabric', () => {
    // The 200 px word widens the 100 px Box; "short" centres in 200 px.
    const layout = layoutText(text({ text: 'Supercalifragilistic\nshort', align: 'center' }), mono)
    expect(layout.lines.map((l) => l.x)).toEqual([0, 75])
  })
})
