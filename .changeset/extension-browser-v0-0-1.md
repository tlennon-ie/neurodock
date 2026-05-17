---
"@neurodock/extension-browser": minor
---

# @neurodock/extension-browser v0.0.1 — WXT scaffold

First release of the browser extension. WXT-based Manifest V3 scaffold
targeting Chrome, Firefox, and Edge.

- Service worker with context-menu registration and message router funnelling all model calls through a single `translation-client` boundary.
- Popup with profile settings, local-vs-cloud toggle, persistent cloud-mode banner, and history list.
- Seven per-site content scripts (Gmail, Slack web, Linear, Notion, GitHub, Google Docs, Outlook web) sharing one `_shared/` module set: Shadow-DOM mount, selection watcher, floating button, result panel, content-app, bootstrap.
- Build-time prompt sync from `packages/mcp-translation` — one prompt repo, zero drift.
- Local-first default: no remote endpoints in the manifest. Cloud mode requires an explicit per-user provider configuration; v0.0.1 returns a labelled `MOCK` response in local mode.
- Tailwind config with Atkinson Hyperlegible / Lexend / JetBrains Mono and the calm-neutral palette. No animations.
- Vitest suite covering profile, translation client, selection watcher, floating button, banner, storage, and prompt sync.

References: ADR 0005, `packages/extension-browser/CHANGELOG.md`.

## Open questions before publish

- v0.0.1 is a **developer preview scaffold** — Chrome Web Store / Firefox Add-ons / Edge Add-ons submission is deferred to v0.0.2 once Ollama / cloud wiring lands. This changeset does NOT trigger store submission; it triggers an npm publish of the package under `@neurodock/extension-browser` for downstream consumers (and CI/build verification).
- E2E (Playwright) and `axe-core` accessibility runs are deferred to v0.0.2; release notes call this out.
