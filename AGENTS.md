# AGENTS.md

## Banners

Read `docs/agents/bannerkit.md` before creating, editing, validating, previewing or rendering a banner: Document schema conventions, every CLI command with `--json`, the Selection, and the edit → validate → preview → look loop.

## Agent skills

### Issue tracker

Issues and specs live in GitHub Issues for `michalstaniecko/bannerkit` (via the `gh` CLI). `.scratch/` holds the archived local-markdown history (e.g. the resolved `bannerkit-v1` spec). See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), applied as GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.
