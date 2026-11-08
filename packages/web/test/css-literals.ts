// Literal guard for the editor's CSS (spec M1, ticket #5): outside the tokens file,
// colors, spacing and radii come from semantic tokens only. No stylelint; this
// scanner is the whole rule.

export interface CssLiteral {
  line: number
  property: string
  literal: string
}

// Every CSS named color (CSS Color 4), lowercase. `transparent` and `currentcolor`
// are keywords, not palette choices, so they stay allowed.
const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue ' +
    'blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk ' +
    'crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki ' +
    'darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen ' +
    'darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue ' +
    'dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite ' +
    'gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan ' +
    'lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen ' +
    'lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen ' +
    'magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen ' +
    'mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream ' +
    'mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid ' +
    'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum ' +
    'powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen ' +
    'steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
)

// Primitive token prefixes. Components and layout reference the semantic layer only,
// so a dark theme is a swap of semantic tokens.
const PRIMITIVE_TOKEN = /var\(\s*(--(?:color|space|radius|font-size|font-family)-[\w-]*)/g

const SPACING_PROPERTY = /^(?:(?:padding|margin)(?:-[\w-]+)?|(?:row-|column-)?gap|border(?:-[\w-]+)?-radius)$/

/** Every banned literal in `css`, with its 1-based line. */
export function findCssLiterals(css: string): CssLiteral[] {
  // Blank out comments but keep newlines so line numbers survive.
  const text = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  const found: CssLiteral[] = []
  // A declaration is a segment ending in `;` or `}`; one ending in `{` is a selector.
  const segment = /[^{};]*[{};]/g
  for (let m = segment.exec(text); m; m = segment.exec(text)) {
    if (m[0].endsWith('{')) continue
    const decl = /^(\s*)(-?[a-z][\w-]*)\s*:([\s\S]*)[;}]$/i.exec(m[0])
    if (!decl) continue
    const line = lineAt(text, m.index + decl[1]!.length)
    const property = decl[2]!.toLowerCase()
    const value = decl[3]!
    for (const literal of colorLiterals(value)) found.push({ line, property, literal })
    if (SPACING_PROPERTY.test(property)) {
      for (const px of value.match(/-?\d*\.?\d+px\b/g) ?? []) found.push({ line, property, literal: px })
    }
    for (const ref of value.matchAll(PRIMITIVE_TOKEN)) found.push({ line, property, literal: ref[1]! })
  }
  return found
}

function colorLiterals(value: string): string[] {
  // Custom property names (`--color-red`) are not color names.
  const bare = value.replace(/--[\w-]+/g, ' ')
  const out: string[] = []
  out.push(...(bare.match(/#[0-9a-f]{3,8}\b/gi) ?? []))
  out.push(...(bare.match(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/gi) ?? []))
  for (const word of bare.match(/(?<![\w#-])[a-z]+(?![\w(-])/gi) ?? []) {
    if (NAMED_COLORS.has(word.toLowerCase())) out.push(word)
  }
  return out
}

function lineAt(text: string, index: number): number {
  let line = 1
  for (let i = 0; i < index; i++) if (text[i] === '\n') line++
  return line
}
