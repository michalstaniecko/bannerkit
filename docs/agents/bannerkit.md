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

## Document schema (v2)

The full schema is `packages/core/schema/document.schema.json`. It is generated from `packages/core/src/document.ts`, which is the source of truth. `examples/demo/documents/hero.json` uses every Layer type (as a v1 file), and `story.json` is a v2 Document with Guides.

```jsonc
{
  "$schema": "…/document.schema.json",
  "version": 2,
  "name": "hero",
  "canvas": { "width": 1200, "height": 628, "background": "#ffffff" },  // background null = transparent
  "guides": { "x": [64, 600], "y": [314] },  // optional
  "layers": [ /* bottom → top */ ]
}
```

**Versions.** Write new Documents as `version: 2`. Files with `version: 1` still work unchanged: every command reads them as v2 in memory and leaves the file alone, and the first saved change (CLI or editor) writes it as v2. A v1 file must not contain v2 fields; one that does fails with ``"<field>" requires version: 2; run `bannerkit migrate` ``. Fix such a file by setting `"version": 2` yourself, because `migrate` only rewrites valid v1 files. `bannerkit migrate <project>` upgrades every valid v1 Document of a Project at once.

**Guides** are editor-only alignment lines: `guides: { x: number[], y: number[] }`. `x` holds the positions of vertical Guides and `y` of horizontal ones, in Canvas pixels. Both arrays are required when `guides` is present, may be empty, and take any finite numbers in any order. Guides never appear in a Preview or Render. `doc resize` moves them with the Layers, and `doc duplicate` copies them unchanged.

Every Layer has these fields: `id`, `type`, `x`, `y`, `width`, plus the optional `rotation`, `opacity` (0–1), `visible`, `locked` and `shadow: { color, blur, offsetX, offsetY }`.

| type | own fields |
|---|---|
| `rect` | `height`, `fill` (colour or LinearGradient), `cornerRadius?` |
| `image` | `height`, `src`, `fit` |
| `text` | `text`, `fontFamily`, `fontWeight`, `fontSize`, `fill`, `height?`, `lineHeight?`, `letterSpacing?`, `align?`, `verticalAlign?`, `autoFit?`, `textTransform?` (v2) |

Conventions:

- **Box**: `x`/`y` is the top-left corner of the Box *before rotation*, in Canvas pixels. `rotation` is in degrees, clockwise, around the Box centre. To rotate a Layer in place, change only `rotation`. The `extent` that `inspect` reports is the axis-aligned rectangle *after* rotation, so they will not equal `x`/`y`/`width`/`height` for a rotated Layer.
- **Colours** are CSS strings: `"#0e3a32"`, `"rgba(0,0,0,0.45)"`.
- **Gradient**: `{ "type": "linear", "angle": 120, "stops": [["#0e3a32", 0], ["#2f8f76", 1]] }`. The angle follows the CSS `linear-gradient` convention: `0` runs bottom to top, `90` runs left to right and `180` runs top to bottom. You need at least two stops, and each offset is between 0 and 1.
- **Fit**: `contain` shows the whole image inside the Box and may leave empty bands. `cover` fills the Box and crops the overflow. `stretch` ignores the aspect ratio. Use the Asset size from `asset add` or `inspect` to size the Box.
- **Text** always wraps at the Box `width`, and `\n` forces a line break. `fontFamily` and `fontWeight` must be a pair listed in `fonts/fonts.json`; currently that is `Inter` at 100–900. `lineHeight` is a multiple of the font size: lines are `fontSize × 1.13 × lineHeight` apart, and the default is `1.16`. `letterSpacing` is in px. Without `height`, the Box grows to fit the text. With `height`, `verticalAlign` positions the text inside the Box.
- **textTransform**: `"uppercase"` or `"lowercase"` changes the case the text is drawn in; `"none"` (or leaving the key out) draws it as written. Keep `text` in its natural case: the transform applies only when the text is laid out. Line breaks, AutoFit and the `lines[].text` that `inspect` reports all use the transformed text, so uppercase usually wraps sooner or shrinks further. The case change ignores locale, and it may change the length of the text (`ß` becomes `SS`).
- **AutoFit**: with `"autoFit": { "minFontSize": 40 }`, the font size shrinks in 1px steps from `fontSize` until the wrapped text fits the Box. AutoFit requires `height`. If the text still doesn't fit at `minFontSize`, it renders clipped, and validation reports a **warning**, not an error. To fix it, shorten the text, enlarge the Box or lower `minFontSize`.
- **ids** must be unique within the Document. Name new Layers `<type>-<n>`, with n one above the highest number already used for that type (`text-5`, `image-3`). The editor uses the same scheme. Refer to Layers by id when you talk to the human.
- **Strictness**: unknown keys are errors, and each error includes a "did you mean" hint. Never add your own fields. Omit an optional field instead of setting it to `null`. The only nullable field is `canvas.background`.
- **Missing Assets**: a `src` that isn't in `assets/` is an error in `validate`, `preview` and `render`. The editor still opens the Document and shows a hatched placeholder. Add the file with `asset add` instead of copying it into `assets/` yourself, because ingest auto-orients the image, converts it to sRGB and records the SVG size.

## CLI

Run commands from the repo as `pnpm bannerkit …`. Relative paths resolve against your current directory. Every command accepts `--json` and `--root <dir>`, and `pnpm bannerkit --help` lists every command.

With `--json`, stdout carries exactly one JSON line:

- success: `{ "ok": true, "result": … }`
- failure: `{ "ok": false, "error": { "code", "message", "issues": [{ "path", "message", "suggestion"? }] } }`
- `validate` or `migrate` with invalid Documents: `{ "ok": false, "result": … }`

Exit codes are 0 for success, 1 for an operation error or invalid Documents, and 2 for a usage error. Error codes include `NOT_FOUND`, `ALREADY_EXISTS`, `INVALID_DOCUMENT`, `INVALID_INPUT` and `UNSUPPORTED_ASSET`.

| command | `result` |
|---|---|
| `project new <name>` | `{ name, path }` |
| `doc new <project> <name> (--preset WxH \| --size WxH)` | `{ project, name, path, document, warnings, hash }` |
| `doc duplicate <project> <from> [<name>] (--preset WxH \| --size WxH)` | same as `doc new`. The Layers are copied unchanged, so rearrange them for the new size. The default name is `<from>-<W>x<H>` |
| `doc resize <project> <doc> (--preset WxH \| --size WxH) [--anchor top-left\|top\|top-right\|left\|center\|right\|bottom-left\|bottom\|bottom-right]` | same as `doc new`. Resizes the Canvas in place, keeping the Anchor point put (default `top-left`). Layers are not scaled: they all move by the same delta and may stick out past the Canvas, so check `placement` with `inspect` afterwards |
| `asset add <project> <files…>` | `{ project, assets: [{ src, path, format, width, height }] }`. Use `src` verbatim. If the name is taken, ingest adds a suffix (`bottle-1.png`) |
| `validate <project \| path/to/doc.json>` | `{ ok, documents: [{ project, name, path, ok, errors, warnings }] }` |
| `migrate <project>` | `{ project, migrated: [{ name, path }], unchanged: [{ name, path }], invalid: [{ name, path, errors }] }`. Rewrites each valid v1 Document as v2; only `version` changes (`$schema` stays). `unchanged` are already v2. `invalid` Documents (the errors `validate` reports) are not written, and the command exits 1. Safe to run again |
| `inspect <project> [<doc>]` | `{ project, name, path, canvas, selection, layers, warnings }` (see below) |
| `preview <project> <doc>` | `{ project, name, path, width, height }` |
| `render <project> [--doc N …] [--size WxH …] [--format png\|jpg\|webp] [--scale 1\|2] [--quality N]` | `{ project, files: [{ name, path, width, height, format, scale }] }` |

The Presets are `1200x628`, `1080x1080`, `1080x1920`, `300x250` and `728x90`. Write the format as `jpg`, because `jpeg` is rejected. `--doc` and `--size` can be repeated. When you give both, a Document must match both filters, and an empty `files` list means nothing matched. `preview` and `render` refuse to run while the Document has validation errors.

Each `inspect` entry in `layers` has the form `{ index, id, type, extent, placement: "inside"|"partial"|"outside", selected }`. Text Layers add `text: { fontSize, requestedFontSize, height, overflow, lines: [{ text, width }] }` (`lines[].text` is after `textTransform`), and image Layers add `asset: { src, width, height }`. The `warnings` list contains text overflow and Layers that are not fully inside the Canvas.

## Selection

When the human says "this", "the selected one" or "what I picked", they mean the editor's Selection.

- `pnpm bannerkit inspect <project> --json` without `<doc>` opens the Document the editor has selected. `result.selection` is `{ doc, selectedLayerIds }`, and the matching `layers[]` entries have `selected: true`. In the text output these are marked with `*`.
- If no Selection is recorded, that command fails with `INVALID_INPUT`. Ask the human which Layer they mean, or pass `<doc>` explicitly. Then `selection` is `null`.
- The Selection is a snapshot taken from the open editor. Read it again before each new request that relies on it.
