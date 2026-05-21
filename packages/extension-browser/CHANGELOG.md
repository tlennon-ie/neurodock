# @neurodock/extension-browser

## 0.0.4

### Added

- **Non-localhost local-provider support.** Users who cannot bind LM
  Studio or Ollama to localhost — Windows installs that pin to a
  link-local APIPA address like `169.254.83.107:1234`, Tailscale nodes,
  or LAN boxes — can now point the extension at any host on the LM
  Studio (`:1234`) or Ollama (`:11434`) port. The user-typed origin is
  granted per-host at runtime via `chrome.permissions.request()` after
  an explicit click, and persists across browser sessions until revoked.
- **`src/lib/permissions.ts`** — single entry point for host-permission
  requests. Exports `requestHostPermission`, `revokeHostPermission`,
  `hasHostPermission`, and `listGrantedNonDefaultOrigins`. Localhost
  and 127.0.0.1 short-circuit without prompting (they are already
  covered by the default `optional_host_permissions`).
- **Settings UX:**
  - When the LM Studio or Ollama Base URL is non-localhost, a
    `NonLocalhostNotice` panel appears under the URL with a single
    "Grant permission for `<origin>`" button. The grant button stays
    inside the user-gesture context required by Chrome and Firefox.
  - Once granted, the notice shows the origin with a
    `(permission granted)` badge and a `Revoke` link.
  - A new "Host permissions" panel at the bottom of Settings lists all
    non-default granted origins with per-row Revoke buttons. The
    default-granted origins (localhost, 127.0.0.1, the seven supported
    sites, and the cloud-provider host you have configured) are NOT
    listed individually.
- **Refresh models** and **Test connection** now request the per-host
  permission first when the configured local provider points at a
  non-localhost host. Permission denial surfaces a precise message
  instead of the opaque "Failed to fetch".
- **Specific permission errors:**
  - `LMSTUDIO_PERMISSION_REQUIRED` distinguishes
    "extension does not have permission for this host yet" from
    `LMSTUDIO_UNREACHABLE` ("server is down").
  - `OLLAMA_PERMISSION_REQUIRED` mirrors the same distinction for
    Ollama.
  - The `translation-client` no longer silently substitutes a labelled
    mock when the failure is a permission gate — the user gets the
    actionable error so they know to grant the host.

### Manifest / CSP

`wxt.config.ts` widens the MV3 `content_security_policy.extension_pages`
`connect-src` directive with **port-restricted host wildcards**:

- `http://*:1234` (LM Studio default port)
- `http://*:11434` (Ollama default port)

The existing localhost / 127.0.0.1 entries are kept intact so
currently-working installs do not regress. The port-restricted wildcard
is strictly safer than `<all_urls>` because the port is fixed to the
two well-known dev-server ports we support; Chrome Web Store accepts
this canonical pattern (used by LocalForage-style developer-tools
extensions for the same reason). The security model is documented in
the header comment at the top of `wxt.config.ts`.

`optional_host_permissions` is widened with `http://*/*` for the
non-localhost case only. The per-host permission is granted per user
gesture, not blanket-granted at install time.

### Tests

- New `tests/unit/permissions.test.ts` covers the helper's behaviour:
  localhost short-circuit, granted, denied, invalid URL, already-granted
  short-circuit, revoke, and `listGrantedNonDefaultOrigins` filtering.
- `tests/unit/providers/lmstudio.test.ts` gains two cases for the new
  `LMSTUDIO_PERMISSION_REQUIRED` path (provider and models fetcher).
- `tests/unit/providers/ollama.test.ts` gains two cases for the new
  `OLLAMA_PERMISSION_REQUIRED` path.
- `tests/unit/settings-tab.test.tsx` gains cases asserting the
  NonLocalhostNotice renders, the Grant button calls
  `chrome.permissions.request` with the correct origin pattern, the
  Refresh-models button requests permission first, and the Host
  permissions panel lists non-default origins.

Test count: 98 → 112.

### Manual verification (Windows LM Studio on 169.254.83.107:1234)

1. Open the extension popup → Settings tab.
2. Select "Local LM Studio". Under Advanced, set Base URL to
   `http://169.254.83.107:1234/v1`.
3. Click "Grant permission for http://169.254.83.107:1234" under the
   URL. Approve the Chrome prompt.
4. Click "Refresh models". Models should populate from LM Studio.
5. Click "Test connection". The extension should hit LM Studio without
   a CSP-blocked error.

If you need to revoke later: Settings → Host permissions → Revoke.

## 0.0.3

### Added

- **LM Studio as a 5th provider.** LM Studio is now a first-class local
  lane alongside Ollama. The Settings tab exposes a "Local LM Studio"
  radio; the provider hits LM Studio's OpenAI-compatible endpoint
  (default `http://localhost:1234/v1`) with SSE streaming via
  `POST /chat/completions`. No API key is required for the default
  unauthenticated server; an optional `apiKey` is available under
  Advanced for users running LM Studio behind a reverse proxy.
- **Model-list fetching ("Refresh models" button).** Every provider that
  exposes a listing endpoint now ships a `fetchModels()` helper and a
  dropdown in Settings. No more typing model slugs from memory.
  - Ollama: `GET {baseUrl}/api/tags` → `models[].name`
  - LM Studio: `GET {baseUrl}/models` → `data[].id`
  - OpenAI: `GET https://api.openai.com/v1/models` → `data[].id`
    (filtered to chat-completion-eligible models when the listing
    contains any)
  - OpenRouter: `GET https://openrouter.ai/api/v1/models` → `data[].id`,
    with `openrouter/auto` always offered as the first option even when
    absent from the upstream listing
  - Anthropic: no listing endpoint exists; the extension keeps a
    hardcoded supported list (`claude-opus-4-7`, `claude-sonnet-4-6`,
    `claude-haiku-4-5-20251001`, `claude-haiku-4-5`). Refresh re-reads
    the constant; new releases require an extension update.
- `ExtensionProfile` gains `localProvider: "ollama" | "lmstudio"` and
  `localApiKey: string | null`. Defaults are `ollama` / `null` so
  existing profiles upgrade cleanly.

### Fixed

- **Cloud provider radio buttons (OpenRouter, Anthropic, OpenAI) are
  clickable again.** The radios appeared to "snap back" to Local Ollama
  because `selectedModeFromProfile` derived the active option from
  `profile.mode`, which only flips to `cloud` after a key is saved.
  Clicking a cloud option with no stored key staged the provider intent
  but the radio render still showed `local`. The fix surfaces the staged
  cloud provider in the UI as soon as it is selected, while still
  honouring the v0.0.2 privacy contract (mode only flips to `cloud`
  after a key is stored).
- **Floating "Translate" button now appears on supported sites.** On SPAs
  like Gmail and Slack the compose box is focused before the content
  script's `document_idle` injection runs, so neither `focusin` nor the
  mutation observer fired for it. The selection watcher now performs an
  initial sweep of `document.activeElement` after mounting, restoring
  the button. The button is also rendered in mock mode — previously
  there was no explicit gate but the missing initial sweep made it
  invisible whenever the user landed on a page with an already-focused
  composer.

### Manifest / CSP

`wxt.config.ts` adds `http://localhost:1234` and `http://127.0.0.1:1234`
to the MV3 `content_security_policy.extension_pages` `connect-src`
directive so the service worker can reach LM Studio. The existing
`optional_host_permissions` entries for `http://localhost/*` and
`http://127.0.0.1/*` already cover the new port.

### Tests

- New `tests/unit/providers/lmstudio.test.ts` covers streaming happy
  path, optional API key, 401, 404 model-not-found, unreachable, and
  non-streaming fallback, plus model-list fetch happy / empty / failure
  paths.
- New `tests/unit/providers/models.test.ts` covers each provider's
  model fetcher (Ollama, LM Studio, OpenAI, OpenRouter, Anthropic
  constant), the auto-router prepend rule for OpenRouter, and the
  central `fetchModels()` dispatch.
- `tests/unit/settings-tab.test.tsx` gains regression tests asserting
  that clicking the OpenRouter / Anthropic / OpenAI radios stages the
  provider intent and that LM Studio selection routes the local lane.
- `tests/unit/selectionWatcher.test.ts` gains an initial-sweep
  regression so the floating button bug cannot return silently.

Test count: 66 → 98.

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

## 0.0.1

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

### Earlier notes from the Phase 2 scaffold

- WXT-based Manifest V3 scaffold targeting Chrome, Firefox, and Edge.
- Service worker, popup, content scripts, shared modules.
- `translation-client.ts` boundary — v0.0.1 returns a labelled MOCK.
- `profile.ts`, `storage.ts`, `cloud-mode-banner.tsx`.
- `scripts/sync-prompts.ts` — build-time mirror of the four
  translation prompts from `packages/mcp-translation`.
- Tailwind config; Vitest unit suite.
