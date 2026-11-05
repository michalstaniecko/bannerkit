import type { TextLayer } from './document.ts'

// Text Layout (ADR 0004): core decides line breaks, font size and line
// positions; renderers only draw the lines. Wrapping copies Fabric 7 `Textbox`
// (`_wrapLine`) exactly so the editor and the server break at the same words.
// No DOM or Node APIs: text is measured through the injected `measure`.

export type FontSpec = { family: string; weight: TextLayer['fontWeight']; size: number }

/**
 * Width in px of `text` drawn in `font` with canvas `letterSpacing` semantics:
 * `letterSpacing` px are added after every grapheme, the last one included
 * (what `ctx.letterSpacing = '<n>px'` + `measureText(text).width` returns).
 * Must return 0 for an empty string.
 */
export type MeasureText = (font: FontSpec, text: string, letterSpacing: number) => number

export type TextLine = {
  text: string
  /** Left edge of the line, from the Box left, after `align`. */
  x: number
  /** Drawn width: the line measured whole, minus the trailing letterSpacing (Fabric `getLineWidth`). */
  width: number
  /** Alphabetic baseline, from the Box top, after `verticalAlign`. */
  baselineY: number
}

export type TextLayout = {
  /** The font size the text is drawn at: `fontSize`, or smaller after AutoFit. */
  fontSize: number
  lines: TextLine[]
  /** Box height the text is laid out and clipped in: `height`, or the text block height when unset. */
  height: number
  /** The text does not fit its Box at `fontSize` (after AutoFit, at the smallest size tried). */
  overflow: boolean
}

/** Fabric `Textbox` default; used when a Layer sets no `lineHeight`. */
export const DEFAULT_LINE_HEIGHT = 1.16
/** Fabric `_fontSizeMult`: a line is fontSize × 1.13 × lineHeight tall. */
const FONT_SIZE_MULT = 1.13
/** Fabric `_fontSizeFraction`: the baseline sits this share of a line box above its bottom. */
const FONT_SIZE_FRACTION = 0.222

/** Resolves a text Layer's Text Layout, shrinking it with AutoFit when the Layer asks for it. */
export function layoutText(layer: TextLayer, measure: MeasureText): TextLayout {
  let wrapped = wrap(layer, layer.fontSize, measure)
  if (layer.autoFit) {
    for (const size of autoFitSizes(layer.fontSize, layer.autoFit.minFontSize)) {
      if (fits(layer, wrapped)) break
      wrapped = wrap(layer, size, measure)
    }
  }
  return place(layer, wrapped, measure)
}

/** The sizes AutoFit tries after `fontSize`: 1px steps down, then `minFontSize` itself. */
function* autoFitSizes(fontSize: number, minFontSize: number): Generator<number> {
  let size = fontSize - 1
  for (; size > minFontSize; size--) yield size
  if (fontSize > minFontSize) yield minFontSize
}

type Wrapped = { size: number; lines: string[]; largestWordWidth: number }

/** Fabric `_splitTextIntoLines` + `_wrapLine` at one font size. */
function wrap(layer: TextLayer, size: number, measure: MeasureText): Wrapped {
  const font = fontOf(layer, size)
  const ls = layer.letterSpacing ?? 0
  const cache = new Map<string, number>()
  const width = (s: string) => {
    let w = cache.get(s)
    if (w === undefined) cache.set(s, (w = s === '' ? 0 : measure(font, s, ls)))
    return w
  }

  const hardLines = layer.text.split(/\r?\n/).map((line) => line.split(/[ \t\r]/))
  const largestWordWidth = Math.max(0, ...hardLines.flat().map(width))
  const maxWidth = Math.max(layer.width, largestWordWidth)
  const spaceWidth = width(' ')

  const lines: string[] = []
  for (const words of hardLines) {
    let line: string[] = []
    let lineWidth = 0
    let infixWidth = 0
    let justStarted = true
    for (const word of words) {
      const wordWidth = width(word)
      lineWidth += infixWidth + wordWidth - ls
      if (lineWidth > maxWidth && !justStarted) {
        lines.push(line.join(' '))
        line = []
        lineWidth = wordWidth
        justStarted = true
      } else {
        lineWidth += ls
      }
      line.push(word)
      infixWidth = spaceWidth
      justStarted = false
    }
    lines.push(line.join(' '))
  }
  return { size, lines, largestWordWidth }
}

/** Positions wrapped lines in the Box (Fabric's vertical model plus `align` / `verticalAlign`). */
function place(layer: TextLayer, { size, lines, largestWordWidth }: Wrapped, measure: MeasureText): TextLayout {
  const font = fontOf(layer, size)
  const ls = layer.letterSpacing ?? 0
  const lineHeight = size * FONT_SIZE_MULT * (layer.lineHeight ?? DEFAULT_LINE_HEIGHT)
  const blockHeight = blockHeightOf(layer, size, lines.length)
  const height = layer.height ?? blockHeight
  // Fabric widens the Textbox to its longest word (`dynamicMinWidth`); align within that.
  const alignWidth = Math.max(layer.width, largestWordWidth - ls)
  const top =
    layer.verticalAlign === 'middle' ? (height - blockHeight) / 2 : layer.verticalAlign === 'bottom' ? height - blockHeight : 0

  return {
    fontSize: size,
    height,
    overflow: !fits(layer, { size, lines, largestWordWidth }),
    lines: lines.map((text, i) => {
      const width = text === '' ? 0 : Math.max(0, measure(font, text, ls) - ls)
      const x = layer.align === 'center' ? (alignWidth - width) / 2 : layer.align === 'right' ? alignWidth - width : 0
      return { text, x, width, baselineY: top + i * lineHeight + size * FONT_SIZE_MULT * (1 - FONT_SIZE_FRACTION) }
    }),
  }
}

function blockHeightOf(layer: TextLayer, size: number, lineCount: number): number {
  const line = size * FONT_SIZE_MULT
  return (lineCount - 1) * line * (layer.lineHeight ?? DEFAULT_LINE_HEIGHT) + line
}

/** No word wider than the Box (which would widen it) and, with a height, no taller than the Box. */
function fits(layer: TextLayer, { size, lines, largestWordWidth }: Wrapped): boolean {
  if (largestWordWidth > layer.width) return false
  return layer.height === undefined || blockHeightOf(layer, size, lines.length) <= layer.height
}

function fontOf(layer: TextLayer, size: number): FontSpec {
  return { family: layer.fontFamily, weight: layer.fontWeight, size }
}
