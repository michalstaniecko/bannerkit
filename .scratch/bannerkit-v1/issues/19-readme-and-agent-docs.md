# 19: README and agent docs

**What to build:** The human can come back after months away and get going from the README, and future agent sessions know how to drive Bannerkit from an agent guide linked from `AGENTS.md`.

**Blocked by:** 07, 08, 09, 14, 15, 16, 17, 18

**Status:** ready-for-agent

- [ ] The README covers install (`pnpm i`, Node 22, Apple Silicon), running (dev and `pnpm start`), editing a banner by pasting JSON, and batch rendering; it uses `examples/demo`
- [ ] An agent guide alongside the existing agent docs covers the schema and its conventions (Box, rotation, gradient angle, Fit, AutoFit, ids), every CLI command with `--json`, Selection, and the edit → validate → preview → look loop
- [ ] `AGENTS.md` links to the agent guide
- [ ] Every command and example in both documents is checked against the actual CLI
