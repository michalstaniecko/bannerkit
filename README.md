# Bannerkit

Bannerkit is a local tool for building fixed-size ad banners from existing product photos. Each banner is a **Document**, a small JSON file that is the source of truth for every Render. An AI agent edits Documents on disk and drives the `bannerkit` CLI. You use a minimal browser editor. Both produce identical pixels. Vocabulary is defined in [`GLOSSARY.md`](GLOSSARY.md), and the design decisions are recorded in [`docs/adr/`](docs/adr/).

## Install

You need Node 22 (22.12 or newer) and pnpm 10. The exact pnpm version is pinned in `package.json` under `packageManager`. The tool is built and tested on Apple Silicon macOS. The native modules (skia-canvas, sharp) ship prebuilt binaries, so you don't need Homebrew or a compiler.

```sh
pnpm i
```

Projects live in `./projects` by default. That folder is git-ignored. To start from the committed demo Project, copy it there:

```sh
mkdir -p projects && cp -R examples/demo projects/demo
```

Keep `examples/demo` itself unchanged, because the tests render it.

## Run the editor

```sh
pnpm start   # builds the editor, then serves editor + API + Assets on http://127.0.0.1:8787
pnpm dev     # Vite with hot reload (it prints the URL, usually http://localhost:5173) plus the API on :8787
```

To use a different projects root, set `BANNERKIT_ROOT`, for example `BANNERKIT_ROOT=~/banners pnpm start`. Set `PORT` to change the port of `pnpm start`.

In the top bar, pick a Project and a Document. You can then:

- drag, resize and rotate Layers; double-click text to edit it; nudge with the arrow keys (Shift moves 10px)
- reorder Layers, hide or lock them in the Layer list on the left
- **Add text / Add rect / Add image** (the image picker accepts PNG, JPEG, WebP and SVG)
- **Group** (Ctrl/Cmd+G) Layers that share a parent and **Ungroup** (Ctrl/Cmd+Shift+G) the selected Groups
- undo/redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z)
- **Export** as PNG, JPG or WebP at 1× or 2×

Edits autosave about half a second after you stop. When an agent changes the file on disk, the editor reloads it. If you have unsaved edits at that moment, it asks you to **reload** or **keep mine**.

### Edit a banner by pasting JSON

The right panel shows the live Document as JSON.

1. Paste or edit the JSON in the panel. For example, change `"text"` on `text-1`, or a layer's `x`.
2. Click **Apply**. A valid Document replaces the current one as a single undo step and is saved.
3. If the Document is invalid, the errors appear under the buttons with a JSON path and a "did you mean" hint, for example `layers[3].fontWieght: unknown key "fontWieght" (did you mean "fontWeight"?)`. Fix the JSON and click Apply again, or click **Revert** to return to the live Document.

## Batch rendering

The CLI works without the server. Run it from the repo with `pnpm bannerkit`. Add `--root <dir>` (or set `BANNERKIT_ROOT`) to choose the projects root.

```sh
pnpm bannerkit validate demo                       # check every Document; exits 1 on errors
pnpm bannerkit render demo                         # every Document, PNG, 1x
pnpm bannerkit render demo --format jpg --scale 2 --quality 85
pnpm bannerkit render demo --doc hero --doc square # only these Documents
pnpm bannerkit render demo --size 300x250          # only Documents of this size
```

Exports are written to `projects/<project>/exports/<doc>.<w>x<h>[@2x].<ext>`, for example `hero.1200x628.png` or `square.1080x1080@2x.jpg`. The formats are `png` (keeps transparency), `jpg` (flattened onto the Canvas background, or white if there is none) and `webp`. Using `--doc` and `--size` together exports only the Documents that match both filters.

New Projects and sizes:

```sh
pnpm bannerkit project new summer
pnpm bannerkit doc new summer hero --preset 1200x628     # Presets: 1200x628 1080x1080 1080x1920 300x250 728x90
pnpm bannerkit doc new summer billboard --size 970x250   # any custom size
pnpm bannerkit doc duplicate summer hero --preset 300x250  # copies Layers unchanged, as hero-300x250
pnpm bannerkit asset add summer ~/Downloads/shoe.jpg      # prints: assets/shoe.jpg 1600x1200
```

Run `pnpm bannerkit --help` for every command. The agent guide, [`docs/agents/bannerkit.md`](docs/agents/bannerkit.md), covers the schema and the agent workflow.

## Develop

```sh
pnpm test        # core, operations and editor tests (Vitest)
pnpm test:e2e    # browser tests incl. browser-vs-server parity (Playwright)
pnpm test:update # refresh render snapshots after an intended change
pnpm typecheck
pnpm schema      # regenerate packages/core/schema/document.schema.json
```

The workspace has three packages: `packages/core` (schema, validation, Text Layout), `packages/server` (operations, CLI, REST API and server renderer) and `packages/web` (the editor). Fonts are listed in `fonts/fonts.json`. Inter (upright and italic, 100–900) is bundled under OFL-1.1.
