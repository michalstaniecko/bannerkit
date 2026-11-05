# AGENTS.md

## Banners

Read `docs/agents/bannerkit.md` before creating, editing, validating, previewing or rendering a banner: Document schema conventions, every CLI command with `--json`, the Selection, and the edit → validate → preview → look loop.

## Agent skills

### Issue tracker

Issues and specs are stored as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default triage roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded on each issue file's `Status:` line. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.
