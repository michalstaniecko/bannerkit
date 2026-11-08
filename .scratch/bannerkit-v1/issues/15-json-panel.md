# 15: JSON panel with paste and Apply

**What to build:** The human sees the live Document as JSON in a right-hand panel, can paste JSON an agent wrote, and apply it. Invalid JSON is rejected, with validation errors shown inline.

**Blocked by:** 13

**Status:** resolved

- [x] A CodeMirror 6 panel shows the live Document and updates as the Canvas changes
- [x] Apply validates with the core schema; on success it replaces the Document via the editor's `apply(document)` and counts as one undo step
- [x] Validation errors are shown inline with their JSON path and "did you mean" hint, and the Document is left unchanged
- [x] An S2 test asserts that applying invalid JSON is rejected with errors
- [x] An S3 test asserts that pasting invalid JSON shows errors

## Comments

Merged branch `worktree-agent-a534e9fa6594a6bfe` into `bannerkit-v1` (fast-forward); unit, typecheck and e2e green.
