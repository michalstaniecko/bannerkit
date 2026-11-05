# Spec: Bannerkit v1

Status: ready-for-agent

## Problem Statement

I'm a developer with no graphic-design skills, and I regularly need ad banners built from existing product photos: a background, a product photo, a headline, a price and a logo, on several fixed sizes, exported as PNG or JPEG at exact pixel dimensions. Design tools are heavy, manual and not scriptable. Most of the banner work will be done by an AI agent (Claude Code) on my behalf, so the banner format has to be readable and editable as plain data. The agent must also be able to check its own results visually. Results must not depend on which machine or renderer produced them.

## Solution

Bannerkit is a local tool built around a small, strict, versioned **Document** JSON format, the single source of truth for a banner.

- **Agents** (primary users) edit Documents directly on disk and use the `bannerkit` CLI to create Projects and Documents, ingest Assets, validate, inspect the computed Text Layout, render Previews they can look at, and batch-Export every size of a Project.
- **The human** uses a deliberately minimal browser editor. They can drag, resize, rotate and reorder Layers, edit text inline, add Layers, paste and apply JSON, undo/redo and Export. The editor picks up changes an agent makes on disk live, and reports the current Selection so the agent can act on "what I selected".
- **The browser and the server produce visually identical Renders** of the same Document. They share fonts (the same TTF files), Text Layout (computed in core) and Supersampling rules.

## User Stories

### Projects and Documents

1. As a user, I want to create a Project with one command, so that all sizes for one SKU or campaign live together.
2. As a user, I want to create a Document from a Preset (1200×628, 1080×1080, 1080×1920, 300×250, 728×90), so that sizes are always exact.
3. As a user, I want to create a Document with a custom size, so that I can serve non-standard placements.
4. As a user, I want to duplicate a Document onto another Preset with its Layers copied unchanged, so that I can rearrange a new size instead of starting from scratch.
5. As a user, I want a Project's Documents to be discovered from its documents folder, so that there's no second list that can drift out of sync.
6. As a user, I want to choose the projects root with a flag or environment variable, so that I can keep banners outside the repo.
7. As a user, I want my working Projects ignored by git and a demo Project committed, so that the repo stays clean but has a working example.

### Assets

8. As a user, I want to add PNG, JPEG, WebP and SVG Assets from the browser file picker, so that I can use existing product photos and logos.
9. As an agent, I want to add Assets with a CLI command that prints each Asset's `src` and dimensions, so that I can reference them in a Document immediately.
10. As a user, I want raster Assets auto-oriented from EXIF on ingest, so that phone photos aren't sideways.
11. As a user, I want raster Assets converted to sRGB on ingest, so that Display P3 or Adobe RGB photos don't look dull next to brand colours.
12. As a user, I want Asset filenames sanitised and de-duplicated with a numeric suffix, so that uploads never overwrite each other.
13. As a user, I want the intrinsic size of SVG Assets recorded, so that both renderers draw them at the right size instead of 300×150.
14. As a user, I want a Layer whose Asset is missing to show as a hatched placeholder in the editor, so that I can still edit the Document.
15. As an agent, I want rendering a Document with a missing Asset to fail with an error naming the Layer and `src`, so that I can fix it.

### Document format

16. As an agent, I want a small JSON schema with Box coordinates (top-left of the unrotated box), rotation in degrees around the centre, and opacity from 0 to 1, so that I can position Layers predictably.
17. As an agent, I want unknown keys rejected with the JSON path and a "did you mean" hint, so that typos like `fontWieght` are caught at once.
18. As an agent, I want duplicate Layer ids, missing Assets and font family/weight pairs not in the font manifest reported as validation errors, so that invalid Documents never reach a renderer.
19. As an agent, I want a generated JSON Schema file that every Document references, so that editors and agents get validation and completion while editing.
20. As an agent, I want readable Layer ids like `text-1` and `image-3`, so that I can refer to Layers by name in conversation.
21. As a user, I want rect Layers with solid or linear-gradient fills (CSS angle convention) and an optional corner radius, so that I can make backgrounds, badges and pills.
22. As a user, I want image Layers with `contain`, `cover` or `stretch` Fit, so that photos fill their Box the way I intend.
23. As a user, I want text Layers with family, weight, size, line height, letter spacing, colour, horizontal align and vertical align, so that headlines and prices look right.
24. As a user, I want a shadow (colour, blur, offset) on any Layer, so that product cut-outs and text stand out.
25. As a user, I want a transparent Canvas background option, so that PNG Exports can keep alpha.
26. As a user, I want Layers that can be locked (not selectable) or hidden, so that backgrounds and logos stay put.
27. As a user, I want the Document to declare its schema version, so that future format changes can be migrated.

### Text Layout and AutoFit

28. As a user, I want text to wrap at its Box width, so that headlines flow onto multiple lines.
29. As a user, I want AutoFit to shrink the font from its declared size to a minimum, in 1px steps, until the wrapped text fits the Box, so that a long price or headline never overflows.
30. As an agent, I want text that still overflows at the minimum size to render clipped and produce a warning, so that I notice without the Render failing.
31. As an agent, I want `inspect` to print each text Layer's resolved font size, line breaks and overflow state, so that I can see what I can't see in the JSON.
32. As a user, I want line breaks to be identical in the browser and on the server, so that what I edit is what gets exported.

### Fonts

33. As a user, I want Inter in every weight bundled locally, so that the tool works offline and renders consistently.
34. As a user, I want fonts declared in one manifest used by both renderers, so that adding a font is a single change.
35. As a user, I want text never measured or drawn with a fallback font, so that wrapping and sizes don't silently change.

### Browser editor

36. As a user, I want to pick a Project and a Document from a plain top bar, so that I can switch between banners quickly.
37. As a user, I want the Canvas fitted to the window, with zoom, so that large and tiny banners are both workable.
38. As a user, I want to select, move, resize and rotate Layers with handles, so that I can lay out a banner by hand.
39. As a user, I want resizing a text Layer to change only its Box and never stretch the glyphs, so that text stays crisp and editable.
40. As a user, I want to edit text inline by double-clicking it, so that copy changes are quick.
41. As a user, I want to multi-select Layers to move, delete or duplicate them together, so that I can adjust groups of elements.
42. As a user, I want to nudge Layers with the arrow keys (Shift for 10px), so that I can position them precisely.
43. As a user, I want a Layer list where I can drag to reorder and toggle visibility and lock, so that stacking order is easy to manage.
44. As a user, I want to add a text, rect or image Layer from the toolbar, so that I can build a banner from scratch.
45. As a user, I want to delete and duplicate Layers, so that I can iterate quickly.
46. As a user, I want a JSON panel showing the live Document, so that I can see exactly what is stored.
47. As a user, I want to paste edited JSON and apply it, with validation errors shown inline, so that I can apply changes an agent wrote.
48. As a user, I want undo/redo where a drag, a text edit, a JSON apply and a reload from disk each count as one step, so that undo behaves the way I expect.
49. As a user, I want edits autosaved shortly after I stop interacting, so that I never lose work.
50. As a user, I want the editor to reload automatically when a Document changes on disk and I have no unsaved edits, so that an agent's changes appear live.
51. As a user, I want to choose "reload / keep mine" when a Document changes on disk while I have unsaved edits, so that neither side's work is lost silently.
52. As an agent, I want the editor's current Selection recorded where `inspect` can read it, so that "make the selected thing bigger" works.
53. As a user, I want the UI to be plain, readable HTML with no styling effort, so that the time goes into functionality.

### Export and Render

54. As a user, I want to Export from the browser as PNG, JPEG or WebP at 1× or 2×, at exactly the Canvas size, so that I get correct files without the CLI.
55. As an agent, I want `bannerkit render` to Export every Document in a Project, or a subset filtered by document name or size, in one command, so that batch export is trivial.
56. As an agent, I want `bannerkit preview` to render a Document and print the image path, so that I can look at the result.
57. As a user, I want JPEG Exports flattened onto the Canvas background (white if transparent), so that they never get black backgrounds.
58. As a user, I want PNG Exports to keep alpha, so that transparent banners stay transparent.
59. As a user, I want every Export supersampled 2× and downsampled, so that edges and small text are smooth at every size.
60. As a user, I want Exports named by document, size and scale in the Project's exports folder, so that files are easy to find and upload.
61. As a user, I want the browser and server Renders of the same Document to differ by less than 1% of pixels, so that either path can be trusted.
62. As a user, I want Export dimensions to be exact for every Preset regardless of my screen's pixel ratio, so that ad platforms accept the files.

### CLI and agent workflow

63. As an agent, I want `bannerkit validate` to work on a Project or a single file and exit non-zero with path-located errors, so that I can check my edits.
64. As an agent, I want every CLI command to accept `--json` and return structured output, so that I can parse results reliably.
65. As an agent, I want the CLI to work without the server running, so that I can work even when the editor isn't open.
66. As an agent, I want a documentation page covering the schema, conventions, CLI and the "edit → validate → preview → look" loop, referenced from the agent instructions, so that future sessions know how to drive Bannerkit.
67. As a future maintainer, I want every CLI command backed by a typed operation that REST also uses, so that an MCP adapter can be added later without a rewrite.

### Setup and docs

68. As a user, I want `pnpm i` to work on Apple Silicon with Node 22 and no Homebrew, so that setup is one command.
69. As a user, I want a README covering install, run, editing a banner by pasting JSON, and batch rendering, so that I can come back after months away.
70. As a user, I want a single command that serves the built editor and API from one origin, so that images never taint the canvas.

## Implementation Decisions

### Layout and stack
- pnpm-workspaces monorepo with three packages: `@bannerkit/core`, `@bannerkit/web` and `@bannerkit/server` (which also contains the `bannerkit` CLI). All are `"private": true` and MIT licensed; Inter stays under OFL-1.1.
- **core:** zod 4 schema and types, validation with friendly errors, JSON Schema generation, Presets, Text Layout and AutoFit, gradient and Fit geometry helpers. It has no DOM or Node APIs.
- **web:** Vite + React + TypeScript strict + Fabric.js 7.x. **server:** Node 22, Hono on `@hono/node-server`, skia-canvas 4.x, sharp.
- Exact library versions are pinned in `package.json` and confirmed against npm during setup. The broken corepack pnpm shim on this machine is fixed during setup by pinning `packageManager`.
- In development, Vite proxies `/api` to Hono. `pnpm start` has Hono serve the built editor, the API and the Project Assets from one origin.

### Storage contract
- Projects root: `./projects` by default, overridable with `--root` or `BANNERKIT_ROOT`; `projects/` is git-ignored.
- `projects/<project>/project.json` holds `{ version, name }` only.
- `projects/<project>/documents/<doc>.json` holds one Document per file. Documents are discovered by listing this directory.
- `projects/<project>/assets/` holds Assets. `src` in a Document is project-relative (`assets/shoe.png`).
- `projects/<project>/exports/<doc>.<w>x<h>[@2x].<ext>` holds Exports. Previews go to `exports/.preview/<doc>.png`.
- `projects/<project>/.state.json` holds `{ doc, selectedLayerIds }`, written by the editor and git-ignored.
- Writes are atomic (write to a temp file, then rename) and only happen after validation.
- `examples/demo/` is a committed Project with three sizes, used by tests and the README.

### Document schema v1 (type shape; frozen after implementation)
```ts
type Document = {
  $schema?: string
  version: 1
  name: string
  canvas: { width: number; height: number; background: Color | null }
  layers: Layer[]            // bottom → top
}
type Common = {
  id: string                 // unique; readable `<type>-<n>` when generated
  x: number; y: number       // top-left of the unrotated Box
  width: number
  rotation?: number          // degrees around the Box centre, default 0
  opacity?: number           // 0–1, default 1
  visible?: boolean          // default true
  locked?: boolean           // default false
  shadow?: { color: Color; blur: number; offsetX: number; offsetY: number }
}
type RectLayer  = Common & { type: 'rect';  height: number; fill: Color | LinearGradient; cornerRadius?: number }
type ImageLayer = Common & { type: 'image'; height: number; src: string; fit: 'contain' | 'cover' | 'stretch' }
type TextLayer  = Common & { type: 'text'; text: string; height?: number;
  fontFamily: string; fontWeight: 100|200|300|400|500|600|700|800|900; fontSize: number;
  lineHeight?: number; letterSpacing?: number /* px */; fill: Color;
  align?: 'left'|'center'|'right'; verticalAlign?: 'top'|'middle'|'bottom';
  autoFit?: { minFontSize: number }  // requires height
}
type LinearGradient = { type: 'linear'; angle: number /* CSS: 0 = to top, 90 = to right */; stops: [Color, number][] }
```
- The schema is strict: unknown keys are errors. Errors carry a JSON path, a message and an optional "did you mean" suggestion.
- Cross-field rules: unique ids; `autoFit` requires `height`; font family/weight must exist in the font manifest. When validated by the server, `src` must also exist.
- Overflow at `minFontSize` is a **warning**, not an error.
- A JSON Schema file is generated from zod, and each Document points to it via `$schema`.
- The brief's `wrap` field was dropped: text always wraps at its Box width.

### Text Layout (core) — see ADR 0004
- `layoutText(layer, measure) → { fontSize, lines: { text, width, baselineY }[], overflow }`, where `measure(fontSpec, text, letterSpacing) → width` is injected by each renderer.
- Wrapping is greedy and word-based, splitting on spaces and keeping explicit newlines, and matches Fabric `Textbox` rules. A single word longer than the Box width is never split inside AutoFit; instead it shrinks the font.
- Vertical metrics follow the Fabric model (line height × font size). The server draws one `fillText` per line at core-computed positions and does not use skia-canvas `textWrap`.

### Fonts — see ADR 0003
- `fonts/fonts.json` lists `{ family, weight, style: 'normal', file }`, pointing at the official Inter static TTFs (100–900).
- The server calls `FontLibrary.use()` with each explicit file.
- The web app generates `@font-face` rules from the manifest and awaits `document.fonts.load()` for every family/weight a Document uses before creating text objects or exporting. After a load it calls `initDimensions()` + `requestRenderAll()`.

### Server renderer
- `renderDocument(doc, { scale, format, quality, assetsDir }) → Buffer`.
- It draws at 2 × scale on skia-canvas, then sharp downsamples with Lanczos to the exact `width × height × scale` and encodes. PNG keeps alpha; JPEG flattens onto the background (white if null); WebP is encoded via sharp. Defaults: PNG, scale 1, quality 90. See ADR 0006.
- Fit geometry, gradient geometry and rotation all come from core helpers shared with the editor.
- SVG Assets are drawn with explicit width and height. A failed image load becomes a typed error naming the Layer.

### Operations layer — see ADR 0005
- Typed, side-effect-explicit functions with zod-validated input that return results; no `console` output and no `process.exit`:
  - `createProject`
  - `listProjects`, `listDocuments`
  - `createDocument({ preset | size })`, `duplicateDocument({ preset | size })`
  - `readDocument`, `writeDocument`
  - `addAssets`
  - `validate`
  - `inspect`, which returns Layers, resolved Text Layout, overflow warnings, Asset sizes, out-of-Canvas Layers and the Selection
  - `render`, which accepts doc and size filters
  - `preview`
  - `readSelection`, `writeSelection`
- Asset ingest uses sharp `autoOrient()` and converts to sRGB, stripping other metadata. JPEG is re-encoded at q95; PNG and WebP are re-encoded losslessly. SVG is stored as-is and its intrinsic size is parsed from `width`/`height`/`viewBox`.
- **CLI** (thin adapter):
  - `bannerkit project new`
  - `bannerkit doc new|duplicate`
  - `bannerkit asset add`
  - `bannerkit validate <project|file>`
  - `bannerkit inspect`
  - `bannerkit preview`
  - `bannerkit render <project> [--doc …] [--size WxH …] [--format png|jpg|webp] [--scale 1|2] [--quality N]`

  Every command supports `--json`. The exit code is non-zero on errors.
- **REST** (thin adapter, same operations): list/read/write Projects and Documents, upload Assets (multipart), serve Assets, render one Document, batch render, and read/write the Selection.
- **SSE:** a recursive watcher on the projects root emits `document-changed { project, doc, hash }`.

### Editor (web)
- A framework-agnostic editor module owns one `fabric.Canvas` and exposes `mount`, `load(document)`, `getDocument()`, `apply(document)`, `undo`/`redo`, `export(options)`, and `on('change' | 'selection')`. React only renders chrome around it; Fabric objects are never React state.
- **Mapper Document → Fabric:** origin is set explicitly (`originX/Y` chosen so that Box top-left plus rotation maps exactly). Rects with gradients and corner radius; images loaded from same-origin Asset URLs, with Fit implemented via scale and a clip path; text as `Textbox` with the core-resolved font size; shadows; opacity; locked → not selectable; hidden → not visible.
- **Fabric events → Document patch:**
  - On `object:modified`, scale is applied to `width`/`height` and reset to 1, and the centre-based position is converted back to the unrotated top-left.
  - On a text edit exit, the text is written back.
  - Text Layers hide their corner controls: side handles change only `width`, and the bottom handle changes `height`.
- **Undo:** in-memory Document snapshots, capped at 100. A snapshot is pushed on modification end, text edit exit, Layer list action, JSON apply and reload from disk.
- **Autosave:** a debounced (500 ms) PUT of the whole Document. The editor ignores its own SSE echo by comparing content hashes.
- **External change:** if the editor is clean, it reloads silently. If it has unsaved edits, it shows a "File changed on disk — reload / keep mine" banner.
- **Selection:** sent to the server on change (debounced).
- **UI:** plain HTML with minimal layout CSS. Top bar (Project/Document pickers, new from Preset, duplicate to size, add text/rect/image, undo/redo, export); left Layer list; centre Canvas fitted to the view with zoom; right JSON panel (CodeMirror 6) with Apply and inline errors. No property panel, snapping or guides.
- **Export:** the editor creates an offscreen render at 2 × scale using `toDataURL({ multiplier })` relative to the logical Canvas size, never `devicePixelRatio`, then downsamples to the target size and encodes. JPEG is flattened onto the background.
- Missing Assets render as a hatched placeholder rect.

## Testing Decisions

- **A good test** exercises a public interface with realistic input and asserts observable output: returned values, files on disk, pixels, dimensions. It never asserts on private helpers or on Fabric internals beyond what parity requires. Tests are written test-first via `/tdd`.
- **S1 — operations layer (Vitest, Node):** runs against a temporary projects root seeded from `examples/demo`. It covers:
  - schema validation errors (paths, hints, cross-field rules)
  - Text Layout and AutoFit via `inspect`, plus a small table-driven core suite for wrapping edge cases
  - Asset ingest: EXIF rotation, a P3 → sRGB fixture, filename collisions, SVG size
  - Render snapshots: committed PNGs compared with pixelmatch under tolerance and refreshable with an update flag
  - exact dimensions for every Preset at 1× and 2×
  - JPEG flattening and PNG alpha
  - missing-Asset errors and the CLI `--json` output shape
- **S2 — editor module (Vitest + jsdom + node-canvas, test-only per the ADR 0002 amendment):**
  - lossless Document → Fabric → Document round-trip for every Layer type, including rotation and every Fit
  - scale applied to `width`/`height` after a simulated resize
  - undo/redo granularity
  - applying invalid JSON is rejected with errors
  - an external change while the editor is dirty raises a conflict

  No text-metric assertions here, because node-canvas measures text differently from Chrome.
- **S3 — full app (Playwright with its bundled Chromium):**
  - browser Export vs server Render of `examples/demo` and every Preset differs by less than 1% of pixels at 1×
  - Fabric `Textbox` line breaks equal core Text Layout for a corpus of strings
  - a font-fallback guard: measuring with the Document's font must differ from measuring with a deliberately unregistered family, and the test fails if `document.fonts.check` is false before text is created
  - editing a document file on disk reloads the editor via SSE
  - pasting invalid JSON shows errors
  - Selection reaches `.state.json`
  - browser Export dimensions are exact on a 2× device-pixel-ratio context
- Everything runs locally: `pnpm test` covers S1 and S2, and `pnpm test:e2e` covers S3. There is no CI. There is no prior art in the repo; this spec establishes it.

## Out of Scope

Background removal, AI image generation, a templates marketplace, animation and HTML5 ads, multi-user, auth, cloud storage, PSD import/export, responsive auto-relayout between sizes, filters beyond opacity and shadow, stroke/outline, text transforms, per-character styling, groups, italics, snapping and smart guides, a property panel, UI styling, an MCP server (planned for v2), and publishing to npm.

## Further Notes

- ADRs 0001–0006 and `GLOSSARY.md` record the reasoning behind these decisions. ADR 0004 replaces the brief's skia-canvas `textWrap = true`; ADR 0006 replaces "supersample small sizes only".
- Training data mixes Fabric 5, 6 and 7 APIs. Verify every Fabric call against the 7.4.x type definitions in `node_modules`, not from memory.
- Agent documentation for driving Bannerkit lives alongside the existing agent docs and is linked from `AGENTS.md`; keep it current with the CLI.
