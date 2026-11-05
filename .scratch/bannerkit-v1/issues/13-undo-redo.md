# 13: Undo/redo

**What to build:** The human can undo and redo, and each logical action counts as exactly one step: a whole drag, a whole text edit.

**Blocked by:** 12

**Status:** ready-for-agent

- [ ] The editor module exposes `undo` / `redo`, backed by in-memory Document snapshots capped at 100
- [ ] A snapshot is pushed at the end of each modification and on text edit exit
- [ ] The snapshot mechanism is reusable by later actions (Layer list actions, JSON apply, reload from disk)
- [ ] Undo/redo buttons in the top bar and keyboard shortcuts
- [ ] Undoing triggers autosave like any other change
- [ ] S2 tests cover undo/redo granularity
