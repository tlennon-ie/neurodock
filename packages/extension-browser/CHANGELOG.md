# @neurodock/extension-browser

## Unreleased

### Added

- Native messaging integration with `@neurodock/native-host` v0.1.0.
  `loadProfile()` now tries the host first and falls back to
  `chrome.storage.local` when the host is not installed. `saveProfile()`
  writes through to `~/.neurodock/profile.yaml` (with a confirm-required
  guard when on-disk fields the extension does not own would be
  clobbered). New `getSyncStatus()` powers the popup's "Profile sync"
  line: `native host (active)` when wired, `extension-local` plus an
  install hint otherwise.
- `src/lib/native-host-client.ts` — tolerant Chrome Native Messaging
  client. Times out at 1.5 s, never throws on a missing host, surfaces
  `CONFIRM_REQUIRED` as a structured flag.
- Popup "Profile sync" section in `entrypoints/popup/App.tsx`.

### Tests

- `tests/unit/native-host-client.test.ts` — probe, get, set,
  confirm-required, and confirm-overwrite paths against an in-memory
  port double.

## 0.1.0

### Minor Changes

- b6a4231: # @neurodock/extension-browser v0.0.1 — WXT scaffold

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

## 0.0.1 (Phase 2 scaffold)

### Added

- WXT-based Manifest V3 scaffold targeting Chrome, Firefox, and Edge.
- Service worker (`entrypoints/background.ts`) with:
  - Context-menu registration (`NeuroDock: translate selection`).
  - Runtime message router that funnels all model calls through the single `translation-client` boundary.
  - Optional local-only history writes when the user has explicitly opted in.
- Popup (`entrypoints/popup/`) with profile settings, mode toggle, cloud-mode banner, and history list.
- Seven per-site content scripts (Gmail, Slack web, Linear, Notion, GitHub, Google Docs, Outlook web), all built on a shared `_shared/` module set:
  - `mountIsland.ts` — Shadow DOM host for style isolation.
  - `selectionWatcher.ts` — one mutation observer per page, editable-focus detection, ignores password inputs.
  - `floatingButton.tsx` — non-modal floating UI.
  - `panel.tsx` — result panel with in-page cloud-mode banner.
  - `contentApp.tsx` — top-level React app stitching the above.
  - `bootstrap.tsx` — site-script entry that loads profile, mounts the island, and round-trips messages with the service worker.
- `translation-client.ts` — the single model boundary. v0.0.1 returns a labelled MOCK response in local mode; emits `MISSING_CLOUD_PROVIDER` and `CLOUD_NOT_WIRED` errors as appropriate in cloud mode.
- `profile.ts` — extension-scoped profile in `chrome.storage.local`. Local-first defaults; refuses cloud mode without a configured provider id.
- `storage.ts` — local-only IndexedDB translation history. Off by default. Metadata + 256-character preview only.
- `cloud-mode-banner.tsx` — persistent banner rendered whenever `profile.mode === "cloud"`.
- `scripts/sync-prompts.ts` — build-time mirror of the four translation prompts from `packages/mcp-translation`. Single source of truth; no drift.
- Tailwind config with Atkinson Hyperlegible / Lexend / JetBrains Mono and the calm-neutral palette per . No animations.
- Vitest unit suite covering profile, translation client, selection watcher, floating button, cloud-mode banner, storage, and prompt sync.

### Notes

- Default mode is **local**. No remote endpoints are requested in the default manifest. Cloud-mode wiring requires explicit per-user opt-in.
- The MCP `mcp-translation` package owns the canonical prompt library. The extension never edits the prompts in place; it syncs them at build time.
- v0.0.1 mock response is deterministic and self-labels via `model_provenance.provider: "mock"` so consumers can detect it.

### Deferred to v0.0.2

- Real local Ollama HTTP wiring.
- Real cloud provider integration (Anthropic, OpenAI).
- Native messaging bridge to `~/.neurodock/profile.yaml`.
- Playwright E2E suite against a loaded extension.
- `axe-core` automated accessibility runs in CI.
- Browser-store submission scripts (Chrome Web Store, Firefox Add-ons, Edge Add-ons).
