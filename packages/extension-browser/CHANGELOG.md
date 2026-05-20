# @neurodock/extension-browser

## 0.0.2

### Added

- **Real LLM calls.** The single `translation-client.ts` boundary now
  dispatches to one of five providers:
  - `ollama` (default; HTTP POST to `http://localhost:11434/api/generate`
    with NDJSON streaming).
  - `anthropic` (official `@anthropic-ai/sdk`; SSE streaming via
    `messages.stream`).
  - `openai` (official `openai` package; SSE streaming via
    `chat.completions.create({ stream: true })`).
  - `openrouter` (OpenAI-compatible HTTPS to
    `https://openrouter.ai/api/v1/chat/completions` with SSE
    streaming; default model is `openrouter/auto`, OpenRouter's
    auto-router that picks the best model per query).
  - `mock` (deterministic developer-only provider).
  Local Ollama is the default; mock is no longer the default lane.
- **Settings tab** in the popup. Provider selection, endpoint URL,
  model name, API key entry, and a "Test connection" button. The API
  key is masked after save (`••••last4`) and is stored in
  `chrome.storage.local` only — never `chrome.storage.sync`.
- **OpenRouter as a 4th cloud provider.** Free-text model field so
  users can target any OpenRouter slug (e.g. `anthropic/claude-3-5-sonnet`,
  `meta-llama/llama-3.3-70b-instruct`, or the default `openrouter/auto`).
  Sends OpenRouter's recommended `HTTP-Referer` and `X-Title` headers.
- **Schema validation on every response.** Each completion is parsed
  defensively (strips markdown fences, locates the JSON object) and
  validated with Ajv against the relevant
  `packages/mcp-translation/schemas/<tool>.schema.json` output
  sub-schema. Failures surface a `LLM_OUTPUT_VALIDATION_FAILED` error
  with a Retry-friendly envelope.
- **Schema sync.** New `scripts/sync-schemas.ts` mirrors the four MCP
  schemas into `src/lib/schemas/` (bundled) and `public/schemas/`
  (web-accessible). Mirrors the existing `sync-prompts.ts` pattern;
  no drift between the MCP server and the extension.
- **Streaming.** Provider calls accept an optional `onToken(delta)`
  callback. Ollama (NDJSON), Anthropic (SDK `text` event), OpenAI
  (chunked async-iterable), and OpenRouter (SSE) all stream into it
  as tokens arrive. Providers gracefully fall back to non-streaming
  when the transport does not support SSE.
- **Schema-in-prompt.** The prompt builder now appends the relevant
  JSON output schema to every model call so the model has the
  specification in-band; this materially improves first-try schema
  conformance and reduces validation retries.
- Per-tool unit tests for happy-path, auth-fail, and
  schema-validation-fail across all four real providers, plus a
  Settings tab render test verifying the API-key masking contract.
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

### Changed

- Default `localModel` is now `llama3.2:3b` (was
  `llama3.1:8b-instruct`). Small enough to run on consumer hardware
  out of the box; users can override in Settings.
- `ExtensionMode` enum gains an explicit `mock` member alongside
  `local` and `cloud`.
- `ExtensionProfile` gains a `cloudApiKey: string | null` field
  persisted to `chrome.storage.local`. The plaintext key is never
  rendered back to the DOM after save.
- The popup is now tabbed (Home / Settings). The Home tab keeps the
  cloud-mode banner, status summary, history list, and the new
  "Profile sync" line; the Settings tab owns provider configuration.

### Manifest / CSP

`wxt.config.ts` adds the following `connect-src` entries to the MV3
`content_security_policy.extension_pages` directive so the service
worker can reach the configured provider:

- `http://localhost:11434` and `http://127.0.0.1:11434` (Ollama)
- `https://api.anthropic.com`
- `https://api.openai.com`
- `https://openrouter.ai`

`optional_host_permissions` is extended with
`https://api.anthropic.com/*`, `https://api.openai.com/*`, and
`https://openrouter.ai/*` so the user is prompted for the
corresponding host permission when they save an API key. No new
default `host_permissions` were added — the local-first guarantee
still holds in the default install.

### Privacy

- The plaintext API key is rendered ONLY while the user types it in.
  After Save, only a masked preview (`••••last4`) and Clear/Replace
  controls are shown.
- The API key is written to `chrome.storage.local` exclusively. It
  is never written to `chrome.storage.sync` and is never logged.
- The Test-connection button uses a fixed prompt that contains no
  user content.

### Deferred to v0.0.3

- Playwright E2E suite against a loaded extension.
- `axe-core` automated accessibility runs in CI.
- Browser-store submission scripts.

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
- Service worker, popup, content scripts, shared modules.
- `translation-client.ts` boundary — v0.0.1 returns a labelled MOCK.
- `profile.ts`, `storage.ts`, `cloud-mode-banner.tsx`.
- `scripts/sync-prompts.ts` — build-time mirror of the four
  translation prompts from `packages/mcp-translation`.
- Tailwind config; Vitest unit suite.
