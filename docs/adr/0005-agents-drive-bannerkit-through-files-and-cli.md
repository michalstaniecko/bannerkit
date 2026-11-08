# AI agents drive Bannerkit through files and a CLI; MCP comes later

The primary user is an AI agent (Claude Code), not the browser UI. Agents edit `projects/<p>/documents/*.json` directly. They use the `bannerkit` CLI (`validate`, `inspect`, `preview`, `render`, `asset add`, `doc new`…, all with `--json` output) and look at Preview PNGs to check results. The CLI works without the server running. The browser editor is deliberately minimal (no property panel or styling) and picks up changes made on disk via a file watcher and SSE. Every CLI command is a thin adapter over a typed operation in `packages/server/src/ops/`, and REST endpoints call the same operations. An MCP server, planned for when the tool may be published for other agents, will then be a third adapter rather than a rewrite.

## Amendment: the editor has an Inspector

The sentence "The browser editor is deliberately minimal (no property panel or styling)" no longer holds. Since M1 the editor has a styled UI built on CSS tokens and an Inspector: a property panel for the Selection (or the Document when nothing is selected), with the JSON panel as one of its tabs. This changes nothing for agents: they still work through the Document files and the CLI, every CLI command stays a thin adapter over an op, and the editor still picks up changes made on disk via the file watcher and SSE.
