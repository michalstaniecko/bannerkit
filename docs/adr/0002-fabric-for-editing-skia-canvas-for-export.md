# Fabric 7 for editing, skia-canvas + sharp for server rendering

The browser editor uses Fabric.js 7.x (selection, transform handles, `Textbox` editing). The server renders with skia-canvas 4.x and uses sharp for image ingest and encoding. Both packages ship prebuilt Apple Silicon binaries, so no Homebrew is needed. We rejected node-canvas (needs Cairo from Homebrew), Jimp (no text or vector support, slow) and running Fabric on Node (it would pull node-canvas in). We also rejected commercial or editor-framework SDKs (Polotno, tldraw, Pintura). Exact versions are pinned in each `package.json`. Fabric 7 defaults (`originX/originY = 'center'`, `preserveObjectStacking = true`) differ from v5/v6 code samples, so the mapper sets origins explicitly.

## Amendment: node-canvas allowed as a test-only dependency

The ban on node-canvas applies to *rendering*. Fabric 7.4.0's Node backend needs `jsdom` (^26.1) and `canvas` (^3.2), and node-canvas 3.2.3 ships a prebuilt N-API binary for darwin-arm64, so no Homebrew is needed. It is therefore allowed as a devDependency of the web package, so editor tests can run quickly under Vitest + jsdom. Text measurement under node-canvas (Pango) differs from Chrome's, so tests about text metrics, line-break parity or font fallback must run in a real browser (Playwright), never under jsdom.
