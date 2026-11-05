# 01: Monorepo setup and first Preview: a blank Canvas from a Preset

**What to build:** An agent can create a Project, create a Document from a Preset or a custom size, duplicate it onto another size, and render a Preview of a Canvas with solid-colour rect Layers, all from the `bannerkit` CLI without the server running. This ticket lays down the pnpm-workspaces monorepo (`@bannerkit/core`, `@bannerkit/web`, `@bannerkit/server`), the operations layer pattern (typed, zod-validated, no `console`/`process.exit`; the CLI is a thin adapter, see ADR 0005), and the S1 Vitest harness that every later ticket builds on.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `pnpm i` works on Apple Silicon with Node 22 and no Homebrew; `packageManager` is pinned so the broken corepack pnpm shim is fixed; library versions are pinned and confirmed against npm
- [ ] All packages are `"private": true` and MIT licensed
- [ ] `bannerkit project new <name>` creates `project.json` (`{ version, name }`) plus `documents/`, `assets/` and `exports/` folders
- [ ] `bannerkit doc new` creates a Document from a Preset (1200×628, 1080×1080, 1080×1920, 300×250, 728×90) or a custom size
- [ ] `bannerkit doc duplicate` copies a Document onto another Preset or size with its Layers unchanged
- [ ] Documents are discovered by listing the documents folder (no second list exists)
- [ ] The projects root defaults to `./projects`, can be overridden with `--root` or `BANNERKIT_ROOT`, and `projects/` is git-ignored
- [ ] Writes are atomic (temp file + rename)
- [ ] `bannerkit preview` renders a Document with a solid background and solid-colour rect Layers, at 2× and downsampled with Lanczos via sharp to exact size (ADR 0006), to `exports/.preview/<doc>.png`, and prints the path
- [ ] Every command accepts `--json` and returns structured output; the exit code is non-zero on errors
- [ ] S1 tests run against a temporary projects root via `pnpm test`
