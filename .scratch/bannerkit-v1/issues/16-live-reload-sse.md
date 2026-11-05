# 16: Live reload from disk (SSE)

**What to build:** When an agent changes a Document on disk, the open editor picks up the change live. If the human has no unsaved edits, it reloads silently. If they do, a "File changed on disk — reload / keep mine" banner lets them choose, so neither side's work is lost silently.

**Blocked by:** 13

**Status:** resolved

- [x] A recursive watcher on the projects root emits SSE `document-changed { project, doc, hash }`
- [x] The editor ignores its own autosave echo by comparing content hashes
- [x] When the editor is clean, it reloads silently; the reload counts as one undo step
- [x] When the editor has unsaved edits, it shows the reload / keep-mine banner; both choices behave as labelled
- [x] An S2 test asserts that an external change while dirty raises a conflict
- [x] An S3 test asserts that editing a Document file on disk reloads the editor

## Comments

- Merged branch `worktree-agent-a4e7318b5686acb98` into `bannerkit-v1` (fast-forward); unit, typecheck and e2e all green.
