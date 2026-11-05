# 15: JSON panel with paste and Apply

**What to build:** The human sees the live Document as JSON in a right-hand panel, can paste JSON an agent wrote, and apply it. Invalid JSON is rejected, with validation errors shown inline.

**Blocked by:** 13

**Status:** ready-for-agent

- [ ] A CodeMirror 6 panel shows the live Document and updates as the Canvas changes
- [ ] Apply validates with the core schema; on success it replaces the Document via the editor's `apply(document)` and counts as one undo step
- [ ] Validation errors are shown inline with their JSON path and "did you mean" hint, and the Document is left unchanged
- [ ] An S2 test asserts that applying invalid JSON is rejected with errors
- [ ] An S3 test asserts that pasting invalid JSON shows errors
