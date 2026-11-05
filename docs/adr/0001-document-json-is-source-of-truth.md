# Document JSON is the source of truth

Banners are stored in a small, strict, versioned JSON schema that we own (`@bannerkit/core`, validated with zod), not in Fabric's `toJSON()` output. The editor maps Document → Fabric objects and Fabric events → Document patches; the server renders directly from the Document. This keeps the format stable and hand-editable by people and AI agents, and frees the server from depending on Fabric. Unknown keys are validation errors, so typos surface immediately.

## Consequences

- The schema is versioned (`"version": 1`). Breaking changes need a new version and a migration.
- Fabric-only state (scale, origin) never leaks into the Document: scale is baked into `width`/`height` when a modification finishes.
