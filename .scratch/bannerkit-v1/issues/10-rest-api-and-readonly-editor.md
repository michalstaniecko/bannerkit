# 10: REST API and a read-only editor for rect Documents

**What to build:** The human runs one command, opens the browser, picks a Project and a Document from a plain top bar, and sees the Canvas (rect Layers) fitted to the window with zoom. This lays down the REST adapter over the same ops as the CLI, the web app, and the framework-agnostic editor module that owns the Fabric canvas.

**Blocked by:** 03

**Status:** resolved

- [x] The Hono REST adapter lists Projects, lists Documents and reads a Document by calling the existing ops; it serves Project Assets
- [x] In development, Vite proxies `/api` to Hono; `pnpm start` serves the built editor, the API and Assets from one origin
- [x] The editor module exposes `mount`, `load(document)` and `getDocument()`; Fabric objects are never React state
- [x] Rect Layers map to Fabric with origins set explicitly, so the Box top-left plus rotation maps exactly; gradients (via the core helper), corner radius, opacity, shadow, locked → not selectable and hidden → not visible are supported
- [x] The Canvas is fitted to the view, with zoom
- [x] The UI is plain HTML with minimal layout CSS
- [x] Every Fabric call is checked against the installed 7.4.x type definitions
- [x] The S2 harness (Vitest + jsdom + node-canvas as a test-only devDependency, per the ADR 0002 amendment) is set up, with a rect mapping test

## Comments

- Merged branch `worktree-agent-a4f5213ba51f89fc5` into `bannerkit-v1`; 256 tests and typecheck pass.
