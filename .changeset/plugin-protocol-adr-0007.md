---
"@neurodock/core": patch
---

# core: plugin protocol schema (ADR 0007)

Documents the v0.1.0 plugin manifest contract in `@neurodock/core`. No
runtime code change ships in this release — the schema is a contract for
Phase 3 to implement against.

- Six plugin types covered by one manifest: `skill`, `mcp-server`, `profile`, `translation-pack`, `language-pack`, `theme`.
- Four-tier trust ladder that degrades gracefully when no central registry is reachable (air-gapped installs are first-class).
- License-compatibility gate: plugin manifests declare a license; the substrate refuses to load license-incompatible plugins.
- `additionalProperties: true` at every level; loaders preserve unknown keys (ADR 0004 forward-compat pattern carries over).
- `provides[].type: language-prompt-override` resolves ADR 0005 open question 3 — language packs shadow default translation prompts by locale.

References: `plan.md` §5, ADR 0004, ADR 0005, ADR 0007.

## Open questions before publish

- None blocking. Federated discovery (`plugins.neurodock.org`) is Phase 3
  work; the manifest is published now so plugin authors can target the
  permanent shape.
