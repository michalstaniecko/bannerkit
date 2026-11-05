# 01: Monorepo setup and first Preview: a blank Canvas from a Preset

**What to build:** An agent can create a Project, create a Document from a Preset or a custom size, duplicate it onto another size, and render a Preview of a Canvas with solid-colour rect Layers, all from the `bannerkit` CLI without the server running. This ticket lays down the pnpm-workspaces monorepo (`@bannerkit/core`, `@bannerkit/web`, `@bannerkit/server`), the operations layer pattern (typed, zod-validated, no `console`/`process.exit`; the CLI is a thin adapter, see ADR 0005), and the S1 Vitest harness that every later ticket builds on.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] `pnpm i` works on Apple Silicon with Node 22 and no Homebrew; `packageManager` is pinned so the broken corepack pnpm shim is fixed; library versions are pinned and confirmed against npm
- [x] All packages are `"private": true` and MIT licensed
- [x] `bannerkit project new <name>` creates `project.json` (`{ version, name }`) plus `documents/`, `assets/` and `exports/` folders
- [x] `bannerkit doc new` creates a Document from a Preset (1200×628, 1080×1080, 1080×1920, 300×250, 728×90) or a custom size
- [x] `bannerkit doc duplicate` copies a Document onto another Preset or size with its Layers unchanged
- [x] Documents are discovered by listing the documents folder (no second list exists)
- [x] The projects root defaults to `./projects`, can be overridden with `--root` or `BANNERKIT_ROOT`, and `projects/` is git-ignored
- [x] Writes are atomic (temp file + rename)
- [x] `bannerkit preview` renders a Document with a solid background and solid-colour rect Layers, at 2× and downsampled with Lanczos via sharp to exact size (ADR 0006), to `exports/.preview/<doc>.png`, and prints the path
- [x] Every command accepts `--json` and returns structured output; the exit code is non-zero on errors
- [x] S1 tests run against a temporary projects root via `pnpm test`

## Comments

- Merged branch `worktree-agent-ae22c86a60cc8f3ca` into `bannerkit-v1` (fast-forward to 6b6a749); 61 tests and typecheck pass.
