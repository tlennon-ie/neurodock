# @neurodock/extension-browser

## 0.0.17

### Fixed — LM Studio image input is now base64, not URL

0.0.15+0.0.16 routed image translations to LM Studio with the OpenAI
multimodal `{type:'image_url', image_url:{url:'https://...'}}` shape.
That works on OpenAI proper — but LM Studio's OpenAI-compatible API
rejects URL-source images with `'url' field must be a base64 encoded
image`. The error didn't match `VISION_MODEL_REQUIRED` so
`translation-client.ts` fell back to mock and the user saw a confused
"configured provider was unreachable" banner.

Resolution: the LM Studio provider now fetches each image URL itself
(in the service-worker context where `host_permissions` bypass CORS),
converts the response body to a base64 `data:` URL with the right MIME
type, and sends THAT to LM Studio. The user's actual vision model
(LLaVA-family, Qwen2-VL, MiniCPM-V, etc.) receives bytes it can read.

Edge cases handled:

- **`data:` URLs are passed through** unchanged (no double-encode).
- **HTTP errors during fetch** raise `LMSTUDIO_IMAGE_FETCH_FAILED`
  with the URL and HTTP status — actionable rather than opaque.
  Specifically calls out auth-walled URLs (private repos, signed S3
  links) which the model can't reach either.
- **SVG images** trigger a `console.warn` because most vision models
  can't process raw SVG bytes — the request still goes through (a few
  models do handle SVG) but the user is told to expect a poor result
  and try a PNG/JPEG instead.
- **Large images** stream through `arrayBufferToBase64` with a 32k
  chunk size to avoid `String.fromCharCode` stack overflows.

### Changed — mock model identifier

The mock provider's `model_provenance.model` field used to read
`neurodock-mock-0.1.0`. The `0.1.0` was the MCP schema version (locked
at v0.1.0 per ADR 0005), not the extension version (currently 0.0.17),
which confused users into thinking the extension itself was v0.1.0.
Renamed to `mock-stub (schema-v0.1.0)` so the label is self-describing.

## 0.0.16

### Fixed — CORS error when refreshing local-LLM model lists from the popup

`Refresh models` in Settings was throwing
`Access to fetch at 'http://localhost:1234/v1/models' from origin
'chrome-extension://...' has been blocked by CORS policy` whenever the
user was configured against LM Studio or plain-API Ollama. The popup
runs in the `chrome-extension://...` origin, where cross-origin fetches
face CORS — and LM Studio / Ollama do not send
`Access-Control-Allow-Origin`. The Chrome MV3 escape hatch is to
**proxy the fetch through the service worker**, which has the relevant
`host_permissions` and bypasses CORS.

Resolution:

- New runtime-message type `models:fetch` handled in `background.ts`.
  The handler calls `fetchModels` (the same helper as before) and
  returns `{ success, models, error }` to the popup.
- `SettingsTab.tsx` swaps its direct `fetchModels()` call for
  `fetchModelsViaWorker()`, which proxies via `chrome.runtime.sendMessage`
  when available and falls back to direct fetch only when the runtime
  is absent (unit tests).
- No new permissions required — the existing `host_permissions` +
  `optional_host_permissions` cover every supported provider.

The same path also fixes the Test connection button for non-localhost
local-LLM endpoints (Tailscale, APIPA, LAN boxes) that were previously
intermittently CORS-blocked.

## 0.0.15

### Fixed — LM Studio vision

0.0.14 unconditionally rejected image requests on the local LM Studio
lane with `VISION_MODEL_REQUIRED`, and `translation-client.ts` caught
that error and silently fell back to mock. Users running a real
LLaVA / Qwen2-VL / MiniCPM-V model in LM Studio saw a "configured
provider was unreachable, fell back to mock" banner — wrong message,
real model never tried.

Resolution: LM Studio provider now passes images through using the
OpenAI-compatible multimodal `content` array. The user's model
(whatever it is) decides whether it can handle the image — if it
can't, LM Studio returns an HTTP 400 the user can act on, not a
silent mock fallback. Same approach as OpenRouter pass-through.
`translation-client.ts` also now refuses to mask `VISION_MODEL_REQUIRED`
errors with mock fallbacks (the previous regex only excluded
`_PERMISSION_REQUIRED`).

Ollama still rejects image input for now — its `/api/chat` endpoint
expects base64 `images` parameter and a URL→base64 fetch path needs
to land alongside it. Ollama vision support tracks as a 0.0.16+ item.

### Fixed — panel positioning + source preview clash

0.0.13 anchored the panel using viewport-width math at render time —
which mispositioned when the user scrolled, when the panel grew taller
than expected, or when the host page injected its own layout
transforms. The source-text preview block that sat above the panel
had a 4%-opacity background that clashed with the host page's own
background (Gmail's white, GitHub's dark, etc.) — visually unmoored.

Resolution: panel position is now CSS-only — `position: fixed; top:
16px; right: 16px;` with `max-height: 80vh; overflow-y: auto;` baked
into `.neurodock-panel` in `mountIsland.ts`. No anchor math. Always
sits in the top-right with a 16px gap on every viewport, scrolls
internally if the content exceeds 80% of the viewport.

The source-text preview moved into the panel itself as a styled
section above the result body. It now sits on the panel background
(same cream `#fafaf9` / dark `#262625`) and renders selected text as
italic prose OR the image URL as monospaced text when the user
right-clicked an image.

### Fixed — misleading "History tab" reference in fallback notification

The right-click-on-out-of-permission-page fallback notification said
"open the popup → History tab to read the result" — but the popup has
no "History" tab. History lives under Home. Message updated to
"Open the popup → Home → History to read the result."

### Added — Wipe history button

The Home tab's History section now has a **Wipe history (N)** button
next to the history toggle. Confirms before deleting. Lets users
retain the history feature with a clean slate without disabling
writes entirely. `clearHistory()` was already present in `storage.ts`
since v0.0.1 but was never wired to the popup.

### Changed — Mode summary shows the actual local provider + profile name

The popup Home tab's status line previously hard-coded
"Local Ollama (model)" — but a user on LM Studio saw the same string,
suggesting their config wasn't applied. The status line now reads
"Local LM Studio (model)" or "Local Ollama (model)" based on
`profile.localProvider`. A second line ("Profile: <displayName>")
makes the currently-loaded profile visible at a glance — useful
after running `pnpx @neurodock/native-host install` to confirm the
sync landed.

### Changed — Host permissions panel surfaces always-granted hosts

The Settings → Host permissions section previously listed only
runtime-granted hosts (e.g. a LAN-hosted LM Studio). Users wondered
why Gmail / Slack / Linear / etc. weren't listed despite being
"supported sites". Now there's an expandable "Always-granted hosts"
section listing all default-granted origins by category (local
providers, cloud providers, supported sites). The runtime-granted
list below is clearly labelled as "additional hosts you've granted
at runtime".

## 0.0.14

### Added — image translation (requires a vision-capable model)

Right-click any image on a supported site → **NeuroDock: describe image
(vision)** → the panel renders a literal description, transcribed text
(for screenshots / charts / memes / signage), key visual elements, the
inferred purpose, and an alt-text suggestion. Same ND-friendly UX as
the text panel: TL;DR card on top, collapsible detail below, no raw
schema field names leaking to the surface.

**This feature requires a vision-capable model.** Text-only models
(`gpt-3.5-turbo`, base `claude-haiku-3` without vision tier, plain
Ollama Llama models without `-vision`, etc.) will refuse the request
with a clear `VISION_MODEL_REQUIRED` error rather than silently
returning a fabricated description.

Known vision-capable models:

| Provider   | Vision-capable models                                                                                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI     | `gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-4-vision-preview`, `o1`, `o3`, `o4`, future `gpt-5*`                                                                                                                                |
| Anthropic  | `claude-3-*` family, `claude-haiku-4-*`, `claude-sonnet-4-*`, `claude-opus-4-*`                                                                                                                                                  |
| OpenRouter | `openrouter/auto` (routes to a vision model when the request contains images), or pick a vision-capable upstream slug manually                                                                                                   |
| Ollama     | `llava`, `bakllava`, `llama3.2-vision`, `moondream`, `minicpm-v` — but the **local lane currently rejects image input with VISION_MODEL_REQUIRED in v0.0.14**; cloud-mode is the supported path. Local vision lands in v0.0.15+. |
| LM Studio  | Same — vision support is Phase 2 work.                                                                                                                                                                                           |

### Details

- **New MCP tool**: `describe_image` with schema at
  `packages/mcp-translation/schemas/describe_image.schema.json` and
  prompt template at
  `packages/mcp-translation/src/neurodock_mcp_translation/prompts/describe_image.prompt.md`.
  Validated end-to-end through the same precompiled-AJV path as the
  other four tools (CSP-safe).
- **Context menu**: a new "NeuroDock: describe image (vision)" entry
  fires on `contexts: ["image"]`. Image source URL is read from
  `info.srcUrl`; the page URL is passed as context. The URL is sent
  verbatim to the vision model — neither the extension nor the MCP
  server downloads, caches, or logs the image bytes.
- **Provider plumbing**: `ProviderRequest` gained an optional
  `images: readonly string[]` field. The OpenAI and Anthropic providers
  now build multimodal content arrays (text part + `image_url` /
  `image` source parts) and gate on a coarse model-allowlist so users
  get `VISION_MODEL_REQUIRED` rather than an opaque upstream 400.
  OpenRouter pass-through trusts the routed model. Ollama + LM Studio
  raise `VISION_MODEL_REQUIRED` until Phase 2.
- **Panel**: new `ImageDescribeView` mirrors the `TranslateIncomingView`
  pattern — TL;DR description + "What it's for" + (when present)
  copyable transcribed text + collapsible key elements + alt-text
  suggestion.
- **Mock provider** answers `describe_image` so the extension still
  works in mock mode for developer testing.

### Tests

- Prompt-builder + schema-suffix tests extended to include
  `describe_image` — `199/199` pass.
- `sync-prompts.test.ts` updated to expect all 5 prompts in the
  canonical list.

## 0.0.13

### Fixed

- **Panel clipped off-screen on the right.** 0.0.12 widened the panel
  from 360px → 420px but the right-click positioning math in
  `contentApp.tsx` still subtracted only 380px from the viewport
  width — so the panel rendered 40px past the right edge.
  Resolution: anchor math now derives from the actual panel width
  (`min(420, viewportWidth * 0.92) + 16px margin`) so the panel always
  sits with a 16px right gap regardless of viewport.

### Changed — Panel UX overhaul for ND readers

The 0.0.12 panel rendered every schema field as its own section
(`Explicit ask`, `Likely subtext`, `Unclear bits`, `Suggested next:
acknowledge`) — readable JSON-by-another-name. A user with ADHD/AuDHD
opens the panel wanting "tell me what to do", not "here's a structural
analysis of the message". This release reorganises around the action
gradient:

- **TL;DR card** sits at the top. One sentence. Prefers the explicit
  ask if there is one; falls back to the highest-confidence subtext;
  finally falls back to "Informational message — no direct request."
- **"Do this" card** sits second. Plain-English verb ("Just acknowledge
  you've read it" instead of `acknowledge`), reason in muted text, and
  the copyable draft reply if the model produced one. This is the
  card the user actually acts on.
- **"Why they probably wrote this"** subtext list is collapsed by
  default. Only opened by users who want the analysis. Header carries
  the count so collapsed state still communicates "there is more here
  if you want it".
- **"Worth checking"** ambiguity list is also collapsed by default.
  Raw schema reasons (`vague_timeline`, `vague_referent`,
  `unassigned_owner`, `hedged_commitment`, `deferred_topic`,
  `contested`, `other`) are mapped to plain-English labels
  ("Timing is fuzzy", "Unclear what they mean", "No owner named", …).
  No raw enum names leak into the UI.
- Action verbs (`reply`, `clarify`, `acknowledge`, `set_reminder`,
  `escalate`, `ignore`, `defer`) get the same plain-English mapping.

Voice rules: literal, plain, no clinical phrasing, no marketing.
Action first, analysis second, raw schema names never. Default state
is "minimum noise"; user opts in to detail.

### Tests

`contentApp-context-result.test.tsx` updated to assert on the TL;DR
card content (the new highest-signal surface) rather than the
now-collapsed subtext list. 197/197 still pass.

## 0.0.12

### Fixed — the panel finally renders structured human-readable UI

0.0.11 finally let translations reach the panel (CSP + SW load fixes
shipped over the prior two versions). But once the response arrived
the panel dumped it as `JSON.stringify(data, null, 2)` inside a `<pre>`
— a monospaced black blob harder to read than the source email it was
"translating". That single line of code was the panel's whole render
path.

This release rewrites `panel.tsx` end-to-end with dedicated view
components per tool:

- **`translate_incoming`** → labelled sections: Explicit ask, Likely
  subtext (ordered list with low/med/high confidence badges, no
  spurious decimal precision), Unclear bits (reason + note), Suggested
  next (action + reason + copyable draft reply).
- **`check_tone`** → three horizontal score bars (Direct / Warm /
  Urgent, 0–100) with optional target markers, a list of flagged
  phrases with deltas, an italic hint line.
- **`rewrite_outgoing`** → the rewritten message in a copyable panel,
  tone-shift summary, terms not preserved, warnings.
- **`brief_meeting`** → Asks on me, My asks of others, Decisions,
  Unclear — each with verbatim quotes pulled from `quoted_span.text`
  (the ADR 0005 invariant the schema enforces).

Voice rules applied: no clinical phrasing, no marketing intensifiers,
literal section labels, confidence shown as a coarse band rather than
three decimals.

The panel also gets a sticky close button, a small `via <provider> ·
<model>` provenance footer, and is widened from 360px to 420px with
`max-height: 80vh + overflow-y: auto` so the structured content has
room to render without overlapping page text.

### Note

If you reload the extension before rebuilding, you'll still see the
JSON dump — the build step is what regenerates the bundle. Run
`pnpm --filter @neurodock/extension-browser run build:chrome` then
remove + load-unpacked the card at `chrome://extensions`.

## 0.0.11

### Fixed

- **Service worker registration failure (`Uncaught ReferenceError:
require is not defined`) in 0.0.10.** Ajv's standalone code generator
  emits a single CommonJS `require("ajv/dist/runtime/ucs2length")` call
  for the maxLength helper even with `code: { esm: true }`. Chrome MV3
  service workers don't define `require`, so the worker failed to load
  entirely — every translation request silently rejected with `Could
not establish connection`.
  Resolution: `scripts/compile-schemas.ts` now post-processes the
  AJV-generated module and rewrites every
  `require("ajv/dist/runtime/<name>")` call into a top-level
  `import * as` namespace import. The known runtime helpers
  (`ucs2length`, `equal`, `validateTime`) are hard-listed; any
  unrecognised helper fails the compile step loudly rather than
  shipping broken silently.
  Verified: rebuilt `background.js` has zero actual `require()`
  invocations. The only `require(...)` string in the bundle is a
  metadata string literal inside AJV's own ucs2length module (not an
  invocation).
- **Test backfill for the new validator path.** Existing 197/197 tests
  pass against the precompiled validators — no test changes needed.

## 0.0.10

**This is the fix that actually makes the extension work.** Every prior
release shipped a Chrome-MV3-incompatible JSON-schema validator. Every
translation response failed validation silently with
`EvalError: Evaluating a string as JavaScript violates the following
Content Security Policy directive because 'unsafe-eval' is not an
allowed source of script` and the user saw nothing in the panel.

### Fixed

- **Schema validation now CSP-safe (the real reason translations never
  rendered).** `Ajv.compile(schema)` at runtime calls `new Function(...)`,
  which is `eval`. Chrome MV3 forbids `unsafe-eval`. Result: every
  translation response was rejected by the validator before it could
  reach the in-page panel.
  Resolution: the four translation output schemas are now pre-compiled
  at build time by `scripts/compile-schemas.ts` via Ajv's standalone
  code generator. `validation.ts` imports the compiled validator
  functions directly — no `new Function`, no `eval`. Verified: rebuilt
  `background.js` contains zero `new Function(` references where the
  0.0.9 bundle had them inline from the Ajv runtime.

### Added

- `scripts/compile-schemas.ts` — build-time AJV standalone compiler.
- `compile:schemas` script wired into `sync:all` so it runs on every
  `dev`, `build`, `test`, and `typecheck`.
- `src/lib/schemas/compiled-validators.{js,d.ts}` — auto-generated
  output, gitignored.

### Note on prior 0.0.6–0.0.9 fixes

Every fix shipped in 0.0.6 through 0.0.9 (LM Studio body shape, profile
broadcast, save-error surfacing, notification fallback, Anthropic
JSON-mode, OpenRouter retry, profile:get handler, etc.) was correct —
but the user could never observe any of them because validation failed
before the response could render. The 0.0.10 build is the first version
where the prior nine fixes can actually be exercised end-to-end.

## 0.0.9

P1 bundle from the 2026-05-23 five-agent extension audit
(`.claude-reports/2026-05-23-extension-audit/SYNTHESIS.md`). Eleven
items: seven production fixes, four test backfills covering surfaces
that had **zero** direct coverage when 0.0.6/0.0.7/0.0.8 bugs shipped.

### Fixed

- **Profile saves now broadcast `profile:updated`.** `chrome.storage.onChanged`
  covers content-script islands (the 0.0.8 fix), but a popup open in a
  _separate_ browser window held its own React state and never re-read
  the local store. `saveProfileWithOutcome` now fires a typed
  `profile:updated` runtime message after every storage.set; the popup
  subscribes and applies the new profile to its local state.
- **Popup surfaces save errors instead of swallowing them.** Pre-0.0.9
  every `onChange` site in `App.tsx` and `SettingsTab.tsx` discarded
  the save outcome via `void onChange(...)`. Confirm-required prompts
  from the native host and chrome.storage hard rejections silently
  carried on as if the save had succeeded. The popup now wires through
  `saveProfileWithOutcome`, captures `error`, and renders a dismissible
  red banner.
- **Right-click translations on out-of-permission pages now show a
  notification.** Pre-0.0.9 a right-click translate on any URL outside
  the nine declared `host_permissions` succeeded silently into IndexedDB
  — `chrome.tabs.sendMessage` rejected with "Receiving end does not
  exist" and the user saw nothing. The background script now falls back
  to `chrome.notifications.create` with a basic-type toast carrying the
  status (ok / mock-fallback / error) and the page host.
- **Anthropic now sends a JSON-mode system prompt.** Anthropic has no
  `response_format` knob (unlike OpenAI / LM Studio / Ollama). Both the
  streaming and non-streaming paths now send a `system` instruction
  telling the model to return a single JSON object with no prose, no
  markdown fences, no commentary — substantially improves first-try
  schema conformance and reduces downstream validation retries.
- **Anthropic 404s surface as `ANTHROPIC_MODEL_NOT_FOUND`.** Previously
  a typo or a stale hardcoded model id produced an opaque
  `ANTHROPIC_ERROR: 404 not found`. The error normaliser now maps 404 /
  `not_found_error` / `unknown.*model` to a dedicated prefix the UI can
  hint at ("Update your model in Settings and try again").
- **OpenRouter retries once without `response_format` when upstream
  rejects it.** Some upstream models routed through OpenRouter (older
  Mistral variants, some Llama hosts) reject the
  `response_format: json_object` field with a 400. Same class of bug as
  the v0.0.6 LM Studio fix. The provider now detects this specific 400
  shape (status 400 + body mentions `response_format`/`json_object`/
  `json_mode`) and retries the request once without that field. 400s
  for other reasons (context-length, malformed prompt, etc.) still
  throw without retry.
- **Bare catches across `background.ts`, `bootstrap.tsx`, `App.tsx`,
  `SettingsTab.tsx`, `ProviderTest.tsx` now carry intent rationale.**
  Each catch now explains WHY swallowing is correct (e.g. history write
  failures must not block translation; SW unreachability during
  upgrade leaves the cached profile in place; permissions-API rejection
  collapses the list rather than freezing the panel). Future reviewers
  can tell "intentional non-blocking" apart from "accidentally
  swallowing real errors".

### Added — tests for previously uncovered surfaces

- **`background.ts` direct unit tests** (19 tests). Covers the
  context-menu dispatcher, the `translate` and `profile:get` message
  handlers, and `runTranslate`'s history side-effects. The handler
  callbacks were extracted into a `registerHandlers()` export so tests
  can invoke them without going through `defineBackground`. Production
  behaviour is unchanged.
- **`bootstrapContent` + `mountIsland` unit tests** (9 tests). Covers
  Shadow DOM mounting, idempotent re-mount, `requestTranslate`
  envelope unwrap, profile-fetch re-render, `storage.onChanged`
  re-subscription, and cleanup.
- **`buildPrompt` direct tests** (26 tests). Pre-0.0.9
  `translation-client.test.ts` short-circuited the builder via
  `providerOverride`, so placeholder substitution was bypassed in
  every higher-level test. The new file exercises single-brace
  substitution, double-brace literal preservation, missing-key
  fallback, array/object stringification, and the schema suffix shape
  — across all four tools.
- **Background notification-fallback tests** (3 tests). Pins the new
  `chrome.notifications.create` path so the next refactor can't
  regress it silently.
- **Profile broadcast tests** (2 tests). Pins the `profile:updated`
  broadcast and the no-receiver-rejection swallow.
- **Anthropic JSON-mode + MODEL_NOT_FOUND tests** (2 tests).
- **OpenRouter retry-without-response_format tests** (3 tests,
  streaming + non-streaming + non-`response_format` 400).

Test count: 133 → 197.

## 0.0.8

Bundle of P0 fixes surfaced by a five-agent audit dispatched after the
0.0.7 ship.

### Fixed

- **Content-script islands no longer run with the wrong profile.**
  `bootstrapContent` was sending `{ type: "profile:get" }` to the
  service worker and the worker had **no listener** — exact same shape
  as the 0.0.7 Gmail bug, shipping in production for the life of the
  extension. The message resolved to `undefined`, hit the bare catch
  at `bootstrap.tsx:41`, and every island ran with `defaultProfile()`
  for the life of the tab. Consequence: the in-page cloud-mode banner
  reflected `local Ollama` defaults even when the user had switched to
  cloud mode in the popup, breaking the privacy-transparency contract.
  `background.ts` now handles `profile:get` and returns the loaded
  profile.
- **Popup changes propagate live to open content-script islands.**
  Bootstrap subscribes to `chrome.storage.onChanged` for the profile
  key. When the user switches provider in the popup, every open island
  on every site re-renders with fresh state — no tab reload needed.
- **In-page panel now surfaces silent fallbacks.** When the configured
  local provider was unreachable and the deterministic mock answered
  instead, the popup banner already warned the user, but the in-page
  panel just showed mock JSON with no explanation. Now the panel
  surfaces an inline amber notice when `response.provenance.provider
!== configured.provider AND configured !== "mock"`. Matches the
  popup banner copy.
- **Notion subdomain coverage extended.** Pre-0.0.8 only
  `https://www.notion.so/*` was matched. `*.notion.so/*` workspace
  tenants (e.g. `acme.notion.so/...`) and `*.notion.site/*` public
  shared pages now match too. `host_permissions` extended to suit.
- **wxt.config duplicate `action` key merged.** The MV3 manifest had
  two `action: {...}` declarations; the second silently overrode the
  first. The `default_icon` was being stripped at build time. Merged
  into a single block with both `default_title` and `default_icon`.

### Added

- `profile:get` variant on the `RuntimeMessage` discriminated union.
- `configuredProvider` prop on `Panel` plus `detectFallback` helper.
- Regression tests:
  - LM Studio sends `response_format: { type: "text" }` on the
    streaming path (pins the 0.0.6 fix).
  - LM Studio sends `response_format: { type: "text" }` on the
    non-streaming fallback path too.

### Audit fallout

Five parallel agents audited the codebase. Reports under
`.claude-reports/2026-05-23-extension-audit/`. Headline findings beyond
the fixes in this commit:

- 11 P1 silent-failure patterns still present (bare catches without
  rationale comments, `void onChange(...)` without `.catch`).
- 12 P2 SSE/JSON parse catches that mask malformed-response classes as
  generic "no JSON found" downstream.
- `background.ts` has zero direct unit tests; `bootstrap.tsx` and
  `mountIsland.ts` are wholly untested.
- chrome-devtools MCP cannot load unpacked extensions — recommend
  switching live-test path to Playwright `launchPersistentContext`.

## 0.0.7

### Fixed

- **Right-click "translate selection" now actually shows a result.**
  The service worker has been broadcasting `neurodock:context-result`
  via `chrome.tabs.sendMessage` since the context menu was added, but
  no content-script listener existed — the header comment in
  `entrypoints/_shared/bootstrap.tsx` literally said "Listening for
  context-menu result broadcasts" while the implementation was missing.
  Every right-click translation was running successfully end-to-end on
  the service worker (LM Studio responded, history was written) and
  then silently dropped on the wire. The user's report: stream visibly
  completed to 100% in LM Studio's UI, but nothing appeared on the page
  or in the extension popup. `ContentApp` now registers the listener
  and opens the panel with the response. The panel falls back to a
  viewport top-right anchor when no compose box is focused, instead of
  positioning itself at `(-1000, -1000)` and rendering off-screen.
- **Popup now refreshes its history list while open.** The service
  worker broadcasts `chrome.runtime.sendMessage({ type:
"history:updated" })` after every successful `appendHistory`, and
  the popup listens for it. Pre-0.0.7, the popup read history once on
  mount and never repainted, so a translation completing while the
  popup was already open never appeared until the user closed and
  re-opened it.

### Added

- `neurodock:context-result` and `history:updated` message variants on
  the `RuntimeMessage` discriminated union (`src/lib/types.ts`). The
  context-result payload carries the original `sourceText` and detected
  `channel` so the panel can render a quoted preview above the result.
- 5 new regression tests pinning the contracts above (132/132 pass).

## 0.0.6

### Fixed

- **LM Studio translations no longer fail with HTTP 400.** The provider
  was unconditionally sending `response_format: { type: "json_object" }`,
  which LM Studio's OpenAI-compat API rejects with
  `'response_format.type' must be 'json_schema' or 'text'`. Every
  translation through LM Studio errored before reaching the model. Now
  we send `{ type: "text" }` and rely on `validation.ts`'s `extractJson`
  to pull the JSON object out of the model's response (same path the
  Ollama provider already takes). OpenAI and OpenRouter still send
  `json_object` — they support it.

## 0.0.5

### Changed

- **History row now shows which provider actually answered.** The third
  column of every history entry used to display `local · mock` even when
  the user had Ollama or LM Studio selected and a real call had been
  attempted, because the row never stored the actual provider. It now
  records `provenance.provider` alongside `mode` and `mockMode`, so
  rows read e.g. `local · ollama` for a healthy local call, `local ·
mock` for an explicit mock-mode selection, or `local · ollama → mock
(fallback)` when the configured provider was unreachable and the
  extension gracefully fell back to the deterministic mock.
- **Silent-fallback banner.** When the most recent history entry is a
  fallback (configured provider failed, mock answered instead), the
  popup surfaces a single-line amber banner above the history list
  pointing the user at Settings → Test to diagnose. Closes the most
  common confusion thread (users reading `· mock` and assuming the
  extension is permanently broken when in reality their local provider
  is just not running).

### Migration

- `HistoryEntry` gains an optional `provider?: string` field. Existing
  entries written by 0.0.4 keep working — readers treat a missing
  field as `unknown` and the fallback heuristic only fires when the
  field is present.

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
