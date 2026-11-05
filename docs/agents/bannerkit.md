# Driving Bannerkit

To change a banner, edit its Document JSON on disk and check the result with the `bannerkit` CLI (ADR 0005). The CLI works whether or not the editor server is running. If the editor is open, it reloads the file live. Terms are capitalised as defined in `GLOSSARY.md`.

## The loop: edit → validate → preview → look

For every change:

1. **Edit** `projects/<project>/documents/<doc>.json` directly. To change something the human calls "this" or "the selected one", first run `inspect` (see Selection below).
2. **Validate**: `pnpm bannerkit validate <project> --json`. Fix every error and run it again until it reports `"ok": true`. Read any warnings, such as text overflow.
3. **Preview**: `pnpm bannerkit preview <project> <doc> --json`. The output gives the PNG path in `result.path`.
4. **Look**: open that PNG with the Read tool and compare it with the request. Run `pnpm bannerkit inspect <project> <doc>` for what an image hides: the resolved font size, line breaks, overflow, and Layers that extend past the Canvas. Go back to step 1 until the picture matches.

You are done when validation passes and you have looked at a Preview of the final state. Export with `render` only when the human asks for files.

## Files

```
<root>/<project>/project.json          { version, name }
<root>/<project>/documents/<doc>.json  one Document per file; the folder listing is the list of Documents
<root>/<project>/assets/               Assets; Layers reference them as "assets/<file>"
<root>/<project>/exports/              render output; Previews go in exports/.preview/<doc>.png
<root>/<project>/.state.json           the editor's Selection (written by the editor; read it through inspect)
```

The root is `./projects` by default. Pass `--root <dir>` or set `BANNERKIT_ROOT` to use another one. Names of Projects and Documents must match `[A-Za-z0-9][A-Za-z0-9._-]*`. Create Documents with `doc new` or `doc duplicate`, which also set `$schema`. A file you write by hand only needs to be valid; validation does not compare its `name` with the filename.

## Document schema (v1)

The full schema is `packages/core/schema/document.schema.json`. It is generated from `packages/core/src/document.ts`, which is the source of truth. `examples/demo/documents/hero.json` uses every Layer type.

```jsonc
{
  "$schema": "…/document.schema.json",
  "version": 1,
  "name": "hero",
  "canvas": { "width": 1200, "height": 628, "background": "#ffffff" },  // background null = transparent
  "layers": [ /* bottom → top */ ]
}
```

Every Layer has these fields: `id`, `type`, `x`, `y`, `width`, plus the optional `rotation`, `opacity` (0–1), `visible`, `locked` and `shadow: { color, blur, offsetX, offsetY }`.

| type | own fields |
|---|---|
| `rect` | `height`, `fill` (colour or LinearGradient), `cornerRadius?` |
| `image` | `height`, `src`, `fit` |
| `text` | `text`, `fontFamily`, `fontWeight`, `fontSize`, `fill`, `height?`, `lineHeight?`, `letterSpacing?`, `align?`, `verticalAlign?`, `autoFit?` |

Conventions:

- **Box**: `x`/`y` is the top-left corner of the Box *before rotation*, in Canvas pixels. `rotation` is in degrees, clockwise, around the Box centre. To rotate a Layer in place, change only `rotation`. The `extent` that `inspect` reports is the axis-aligned rectangle *after* rotation, so they will not equal `x`/`y`/`width`/`height` for a rotated Layer.
- **Colours** are CSS strings: `"#0e3a32"`, `"rgba(0,0,0,0.45)"`.
- **Gradient**: `{ "type": "linear", "angle": 120, "stops": [["#0e3a32", 0], ["#2f8f76", 1]] }`. The angle follows the CSS `linear-gradient` convention: `0` runs bottom to top, `90` runs left to right and `180` runs top to bottom. You need at least two stops, and each offset is between 0 and 1.
- **Fit**: `contain` shows the whole image inside the Box and may leave empty bands. `cover` fills the Box and crops the overflow. `stretch` ignores the aspect ratio. Use the Asset size from `asset add` or `inspect` to size the Box.
- **Text** always wraps at the Box `width`, and `\n` forces a line break. `fontFamily` and `fontWeight` must be a pair listed in `fonts/fonts.json`; currently that is `Inter` at 100–900. `lineHeight` is a multiple of the font size: lines are `fontSize × 1.13 × lineHeight` apart, and the default is `1.16`. `letterSpacing` is in px. Without `height`, the Box grows to fit the text. With `height`, `verticalAlign` positions the text inside the Box.
- **AutoFit**: with `"autoFit": { "minFontSize": 40 }`, the font size shrinks in 1px steps from `fontSize` until the wrapped text fits the Box. AutoFit requires `height`. If the text still doesn't fit at `minFontSize`, it renders clipped, and validation reports a **warning**, not an error. To fix it, shorten the text, enlarge the Box or lower `minFontSize`.
- **ids** must be unique within the Document. Name new Layers `<type>-<n>`, with n one above the highest number already used for that type (`text-5`, `image-3`). The editor uses the same scheme. Refer to Layers by id when you talk to the human.
- **Strictness**: unknown keys are errors, and each error includes a "did you mean" hint. Never add your own fields. Omit an optional field instead of setting it to `null`. The only nullable field is `canvas.background`.
- **Missing Assets**: a `src` that isn't in `assets/` is an error in `validate`, `preview` and `render`. The editor still opens the Document and shows a hatched placeholder. Add the file with `asset add` instead of copying it into `assets/` yourself, because ingest auto-orients the image, converts it to sRGB and records the SVG size.

## CLI

Run commands from the repo as `pnpm bannerkit …`. Relative paths resolve against your current directory. Every command accepts `--json` and `--root <dir>`, and `pnpm bannerkit --help` lists every command.

With `--json`, stdout carries exactly one JSON line:

- success: `{ "ok": true, "result": … }`
- failure: `{ "ok": false, "error": { "code", "message", "issues": [{ "path", "message", "suggestion"? }] } }`
- `validate` with invalid Documents: `{ "ok": false, "result": … }`

Exit codes are 0 for success, 1 for an operation error or invalid Documents, and 2 for a usage error. Error codes include `NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_DOCUMENT`, `INVALID_INPUT` and `UNSUPPORTED_ASSET`.

| command | `result` |
|---|---|
| `project new <name>` | `{ name, path }` |
| `doc new <project> <name> (--preset WxH \| --size WxH)` | `{ project, name, path, document, warnings, hash }` |
| `doc duplicate <project> <from> [<name>] (--preset WxH \| --size WxH)` | same as `doc new`. The Layers are copied unchanged, so rearrange them for the new size. The default name is `<from>-<W>x<H>` |
| `asset add <project> <files…>` | `{ project, assets: [{ src, path, format, width, height }] }`. Use `src` verbatim. If the name is taken, ingest adds a suffix (`bottle-1.png`) |
| `validate <project \| path/to/doc.json>` | `{ ok, documents: [{ project, name, path, ok, errors, warnings }] }` |
| `inspect <project> [<doc>]` | `{ project, name, path, canvas, selection, layers, warnings }` (see below) |
| `preview <project> <doc>` | `{ project, name, path, width, height }` |
| `render <project> [--doc N …] [--size WxH …] [--format png\|jpg\|webp] [--scale 1\|2] [--quality N]` | `{ project, files: [{ name, path, width, height, format, scale }] }` |

The Presets are `1200x628`, `1080x1080`, `1080x1920`, `300x250` and `728x90`. Write the format as `jpg`, because `jpeg` is rejected. `--doc` and `--size` can be repeated. When you give both, a Document must match both filters, and an empty `files` list means nothing matched. `preview` and `render` refuse to run while the Document has validation errors.

Each `inspect` entry in `layers` has the form `{ index, id, type, extent, placement: "inside"|"partial"|"outside", selected }`. Text Layers add `text: { fontSize, requestedFontSize, height, overflow, lines: [{ text, width }] }`, and image Layers add `asset: { src, width, height }`. The `warnings` list contains text overflow and Layers that are not fully inside the Canvas.

## Selection

When the human says "this", "the selected one" or "what I picked", they mean the editor's Selection.

- `pnpm bannerkit inspect <project> --json` without `<doc>` opens the Document the editor has selected. `result.selection` is `{ doc, selectedLayerIds }`, and the matching `layers[]` entries have `selected: true`. In the text output these are marked with `*`.
- If no Selection is recorded, that command fails with `INVALID_INPUT`. Ask the human which Layer they mean, or pass `<doc>` explicitly. Then `selection` is `null`.
- The Selection is a snapshot taken from the open editor. Read it again before each new request that relies on it.
