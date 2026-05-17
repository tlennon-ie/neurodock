# @neurodock/extension-browser

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
