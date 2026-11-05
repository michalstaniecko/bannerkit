# 13: Undo/redo

**What to build:** The human can undo and redo, and each logical action counts as exactly one step: a whole drag, a whole text edit.

**Blocked by:** 12

**Status:** resolved

- [x] The editor module exposes `undo` / `redo`, backed by in-memory Document snapshots capped at 100
- [x] A snapshot is pushed at the end of each modification and on text edit exit
- [x] The snapshot mechanism is reusable by later actions (Layer list actions, JSON apply, reload from disk)
- [x] Undo/redo buttons in the top bar and keyboard shortcuts
- [x] Undoing triggers autosave like any other change
- [x] S2 tests cover undo/redo granularity

## Comments

- Merged branch `worktree-agent-a90b88ceb41039c59` into `bannerkit-v1`. Unit tests, typecheck and e2e pass.
- API for later actions: `editor.apply(document, { cause: 'layers'|'json'|'reload' })` shows the Document and records exactly one undo step.
