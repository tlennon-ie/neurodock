# @neurodock/extension-browser

## 0.1.1

### Patch Changes

- b574263: fix(extension): declare nativemessaging so the native host can connect

  "full neurodock" never connected for any user. the manifest never declared the
  `nativeMessaging` permission, so `chrome.runtime.connectNative` was undefined and
  `probeNativeHost` silently reported "not connected" without ever launching the
  host. that is why clicking "check again" produced no network / console / service
  worker activity, while `neurodock doctor` — which spawns the launcher directly
  and bypasses chrome — passed.

  the permission is declared in `optional_permissions` (not `permissions`) and
  requested at runtime on the "turn on full neurodock" / "check again" user gesture
  via `chrome.permissions.request`, so a plain install shows no native-messaging
  warning. the auto-poll stays non-interactive and never prompts; the grant
  persists across restarts. verified against chrome, firefox 115+, and edge
  (`nativeMessaging` is requestable as an optional permission on all three).

## 0.1.0

### Minor Changes

- c972082: feat(extension): tourette prompt addendum (r3) + voice_input_preferred and line_height_hint consumption (r5)

  three additive, opt-in signals. a profile that declares none of them produces
  exactly the pre-change behaviour (covered by back-compat tests).

  - **tourette addendum (r3):** `tourette` was an explicit no-op in the
    per-neurotype prompt shaping. reviewed against the new `tourette-advocate`
    lens, it now gets a genuine, concise text-shaping block: be answer-first
    (less time held under attention + suppression load), plain and low-pressure,
    with no reassuring/soothing/motivational register and no commentary on the
    reader's behaviour, focus, or composure. the block is tool-independent and
    fuses correctly with the existing audhd/overlap logic.
  - **voice_input_preferred (r5):** when set, the prompt builder appends a
    cross-cutting line (regardless of neurotype) asking downstream prose to keep
    any example, draft, or snippet as a single copy-pasteable block — dictation
    and motor users cannot cheaply hand-edit punctuation scattered across a
    response.
  - **line_height_hint (r5):** the band (`compact` | `default` | `relaxed`) now
    drives the body line-height of rendered output across the popup, full-page
    tab, and in-page island via a single `lh-*` class and a new
    `--nd-body-line-height` token. mapping: compact = 1.5, default = 1.6,
    relaxed = 1.75 — never below the wcag 1.4.8 / 1.4.12 conformance floor of
    1.5 for any band. body paragraphs read `--nd-body-line-height` with a
    fallback to `--nd-line-height`, and focus-mode (1.45) was reconciled so it
    only re-binds ui-chrome line-height and can never combine with a set hint to
    pull a body paragraph below 1.5 (the in-page island's focus-mode panel rule
    was removed for the same reason). as a result, un-hinted island body
    paragraphs now floor at 1.5 under focus-mode (previously 1.45, which was
    below the wcag body floor).

  both new fields flow through the extension profile and the native-host on-disk
  mapping (`preferences.voice_input_preferred`, `preferences.line_height_hint`)
  as optional keys — they are only written to disk when the user sets them.

### Patch Changes

- 12331e3: read per-neurotype prompt shaping from the shared `@neurodock/core` artifact (r1 part a)

  internal refactor with zero behaviour change. `buildNeurotypeAddendum` no
  longer hard-codes the per-(tool x neurotype) blocks inline; it now delegates to
  `@neurodock/core`'s `assembleNeurotypeAddendum(neurotypeAddendaV1, ...)`, the
  single source of truth that the mcp-translation server will also read. the
  public signature (`buildNeurotypeAddendum(profile, tool?)`) is unchanged, so
  prompt-builder.ts and every existing test are untouched.

  the cutover is proven byte-for-byte: a new golden-snapshot test asserts the
  output is identical to the previously-shipped hard-coded function across the
  full cross-product of all five tools (+ the no-tool overload), every neurotype
  combination (single types, the adhd+asd -> audhd fusion, explicit audhd, a 3+
  multi-type, and empty), max_chunk_size variants, voice_input_preferred
  true/false/unset, output_format variants, and additional_notes present/absent.
  adds `@neurodock/core` as a workspace dependency.

- Updated dependencies [8239692]
- Updated dependencies [e3a92b0]
- Updated dependencies [12331e3]
- Updated dependencies [238ef15]
- Updated dependencies [3cee0d0]
- Updated dependencies [2e8a634]
  - @neurodock/core@0.2.0

## 0.0.38

### Patch Changes

- c16e4d3: fix(extension): use lm studio structured output (json_schema) so small local models stop failing validation

  The LM Studio provider was the only provider that requested plain `text`
  output instead of constrained JSON. Capable models followed the
  "return only JSON" instruction, but small local models (e.g.
  `gemma-4-e4b`) routinely emitted prose, so `extractJson` found no JSON
  object and every call failed with
  `LLM_OUTPUT_VALIDATION_FAILED (Could not locate a JSON object in the
model completion.)` — while the same request worked fine on OpenRouter.

  LM Studio's own 400 ("must be `'json_schema'` or `'text'`") points to the
  fix: it supports OpenAI-style structured output. The provider now sends
  `response_format: { type: "json_schema", json_schema: { name, strict,
schema } }`, which grammar-constrains decoding (GBNF under the hood) so
  even a 4B model is forced to produce schema-valid JSON.

  - New `modelFacingSchema(tool)` builds the structured-output schema with
    the server-owned fields (`model_provenance`, `eval_corpus_slice`)
    stripped, so a `strict` grammar can't force the model to hallucinate
    provenance (ADR 0005). Those fields are still injected by
    `normaliseLLMOutput` after parsing.
  - Graceful fallback: if a server/model rejects structured output with a
    400 that names `response_format`/`json_schema`, the provider retries
    once in plain-text mode (mirrors the OpenRouter and Google providers).
    Unrelated 400s still surface as real errors.
  - Validation now drops stray properties at any nesting level
    (`removeAdditional: "all"` in the compiled validators) instead of
    rejecting. llama.cpp's GBNF grammar doesn't enforce
    `additionalProperties: false` on nested objects, so a small model adding
    a stray key to e.g. a `content_translation[].facets[]` entry no longer
    fails an otherwise-valid response. Required fields and value constraints
    (types, enums) are still enforced — the recursive version of the
    existing top-level field stripping.

- a7c3f01: fix(extension-browser): pin the onboarding full-setup command to @latest

  The Power-Up card / onboarding slide showed `npx @neurodock/cli setup`,
  which reuses whatever older copy npx already cached — often one that
  predates the `setup` subcommand, so it fails with "unknown command
  'setup'". The advertised command is now `npx @neurodock/cli@latest setup`,
  forcing npx to resolve the current published version (matching the
  `@latest` form the docs already use).

## [unreleased]

### Changed

- Build targets raised to the extension's real minimums (Chrome 110,
  Firefox 115, es2022) — required by esbuild >=0.28.1, which the
  workspace now forces to clear two security advisories. No runtime
  change: every supported browser already met these floors.

## 0.0.37 - 2026-06-12

### Fixed

- Declare `data_collection_permissions: { required: ["none"] }` in the
  gecko manifest block — AMO now rejects submissions without it. "None"
  is the truthful value: the developer collects nothing; selected text
  only goes to endpoints the user configures (localhost by default,
  cloud only with explicit opt-in and the user's own key).

## 0.0.36 - 2026-06-11

### Added — experience redesign (WS1)

- Reader-font switcher in the header: Atkinson Hyperlegible, Lexend,
  OpenDyslexic, Comic Neue, or the system font. Same `neurodockFont`
  contract as docs.neurodock.org; OpenDyslexic and Comic Neue woff2 now
  ship in the bundle. The choice applies pre-paint (no flash) across the
  popup, the full-page view, and the in-page panel.
- Shared branded header (mark + wordmark + font switcher + theme toggle
  - an expand button that opens the full-page view).
- Reader preferences are now the first thing in Settings, with settings
  split into Essentials (open) and Advanced (collapsed). Nothing removed.
- "Turn on full NeuroDock" power-up card: one copy-paste command with a
  live "Connected" check against the native host.
- Identity-first onboarding (~2 steps): how you read best, then connect
  a model — with a running LM Studio/Ollama auto-detected for a one-tap
  local connect. Both steps skippable; no CLI command required.
- Popup slimmed to Home + Notifications; full settings live on the
  full-page view.

### Changed

- Plain-language copy throughout: "settings sync across browsers"
  instead of "native host"; "always-on check-ins" instead of
  daemon/hook jargon; raw commands appear only inside the power-up card.
- OpenDyslexic/Comic Neue get metric compensation (85%/95% root scale)
  so large glyphs never overflow the popup; header controls always stay
  on one row (the font select shrinks with an ellipsis instead).

### Fixed

- The pre-paint font script now loads as an external file —
  MV3 extension pages block inline scripts at runtime, so the inline
  version silently never ran.

### Changed — power-up card now advertises `npx @neurodock/cli setup`

`FULL_SETUP_COMMAND` pointed at `install-all` while the unified setup
command was still a later workstream. The CLI now ships `neurodock
setup` (install-all + install-hooks in one go), so the card's
copy-paste command is repointed to it. No UI change otherwise.

## 0.0.35

### Added — notifications inbox in the full-tab view

The tab view's Notifications section was a reserved placeholder ("a full
inbox of background events lands here once the notifications feature
ships"). It now renders the real inbox. Rather than build a second
surface, the tab view reuses the same `NotificationsTab` component the
popup already ships — a single source of truth over
`src/lib/notifications.ts`, so the two surfaces never drift. Background
events (proactive pacing nudges, guardrail signals, translation errors)
collect there with per-item read/unread + delete, bulk mark-all-read /
delete-all, and per-category mute controls. A short intro precedes the
inbox for the roomier tab layout; everything still stays inside the
browser (`chrome.storage.local`, never `sync`).

### Changed — History (and the in-page result panel) show a clickable image thumbnail instead of a raw URL

A `describe_image` history row whose source was an extension-less CDN
URL — e.g. a LinkedIn image like
`https://media.licdn.com/dms/image/v2/…/1775633530817?e=…&v=beta` —
rendered as a monospaced URL blob because the old thumbnail heuristic
only recognised URLs ending in a known image extension (`.png`, `.jpg`,
…). `SourcePreview` now takes an `isImageSource` hint, set by the three
call sites that KNOW the source is an image (`describe_image` rows in
the popup + tab history, and the describe_image result panel). When set,
an http(s) source renders as a thumbnail regardless of its URL shape,
and the thumbnail is a link that opens the full image in a new tab
(`target="_blank"` + `rel="noopener noreferrer"`). The raw URL string is
no longer shown alongside the image. `data:` sources still render a
thumbnail but are left un-linked, because Chrome blocks top-level
navigation to `data:` URLs and an inert link would mislead.

## 0.0.34

### Security — tightened extension CSP (drop `http:`/`https:` wildcards in `connect-src`), removed inline sourcemaps from production bundle, hardened channel detection against URL spoofing

Three security findings from the 2026-05-27 audit (C1, H1, H2) addressed. The
bare `http:` and `https:` wildcards in `connect-src` that were introduced in
v0.0.21/v0.0.22 for image-translation fetch support have been replaced with an
explicit list of cloud-provider origins (`api.anthropic.com`, `api.openai.com`,
`openrouter.ai`, `generativelanguage.googleapis.com`) plus the already-present
port-restricted LM Studio and Ollama wildcards; a known limitation is that SW
fetch() for image bytes from arbitrary HTTPS/HTTP sites will be CSP-blocked
until a proxy approach is designed (finding C1). Inline sourcemaps have been
removed from the production Vite build (`sourcemap: false`), preventing
original TypeScript source from being embedded inside every distributed `.crx`
or `.xpi` (finding H1). The `detectChannelFromUrl` helper was rewritten to
parse URLs with the `URL` constructor and match on `hostname` only, closing
a spoofability window where crafted URLs such as
`https://evil.com/?q=mail.google.com` or `https://mail.google.com.evil.com/`
could have been misclassified as the `email` channel (CodeQL alerts #28-29,
finding H2).

### Changed — theme v2 alignment with docs site (light + dark + user toggle + per-surface fidelity)

The 0.0.32 visual-identity refresh shipped the OKLCH tokens verbatim
but the extension still looked unlike the docs site because the
typography fell back to `system-ui` and there was no user-controlled
light / dark switch. 0.0.34 closes both gaps and tidies the popup +
tab header hierarchy.

- **Bundled webfonts**: `Atkinson Hyperlegible` 400 / 400-italic / 700,
  `Lexend Variable`, and `JetBrains Mono Variable` ship as woff2 under
  `public/fonts/` (SIL OFL 1.1 — see `public/fonts/LICENSE.md`). New
  `src/styles/fonts.css` declares the `@font-face` rules; popup + tab
  stylesheets import it before tokens.css. The shadow-DOM stylesheet
  in `mountIsland.ts` references the same files via
  `chrome.runtime.getURL("fonts/...")` so in-page islands match the
  popup typography. `web_accessible_resources` gains a `fonts/*.woff2`
  entry to permit the cross-origin reach.
- **User theme override**: new `themeMode: "system" | "light" | "dark"`
  preference (default `"system"`) lives under `neurodock.themeMode.v1`
  in `chrome.storage.local` (never `sync`). New
  `src/lib/theme-mode.ts` owns load / save / apply with the same
  early-paint pattern as `accessibility.ts`. New
  `src/components/ThemeModeToggle.tsx` renders a single icon button
  that cycles System → Light → Dark on click. Wired into the popup
  header (16px icon) and the tab view header (18px icon). The flip is
  synchronous — the class lands on `<html>` on the click tick; the
  persist round-trip is best-effort.
- **Token override paths**: `src/styles/tokens.css` gains
  `:root.nd-theme-light` / `:root.nd-theme-dark` rules that beat the
  OS media query in both directions (light forced inside a dark OS,
  dark forced inside a light OS). `mountIsland.ts` mirrors the same
  rules as `:host(.nd-theme-light)` / `:host(.nd-theme-dark)` for the
  shadow-root islands.
- **Bootstrap propagation**: `entrypoints/_shared/bootstrap.tsx` reads
  `themeMode` on mount and re-reads it via the
  `chrome.storage.onChanged` listener so toggling theme in the popup
  flips every open in-page island without a tab reload (same pattern
  the A3 accessibility flip already uses).
- **Header tidy**: popup + tab `<h1>` move from `font-medium text-fg`
  to `font-semibold text-fg-accent tracking-tight` so they match the
  docs site `.site-title` weight + accent colour. The popup header
  now hosts a flex row with the theme toggle alongside the existing
  Open-in-tab button.
- **Icon parity**: confirmed (`cmp` byte-identical) that
  `public/icon/{16,32,48,128,256}.png` match `docs/public/icon/*.png`
  shipped in 0.0.32 — no regeneration needed.

### Migration notes

- No schema change to `ExtensionProfile` — themeMode is a sibling
  preference under its own storage key, so existing installs are
  untouched and the first popup open paints with `"system"` mode.
- The font fallback stack (`"Atkinson Hyperlegible", system-ui, ...`)
  is unchanged in tokens.css, so on the first paint before the woff2
  decodes the surface still renders with `system-ui` exactly as
  before — there is no FOIT (`font-display: swap` is set).

## 0.0.33

### Added — pacing copilot (configurable break suggestions; opt-in default for OCD / AuDHD users)

Periodic, non-blocking pacing nudges land as in-page toasts in the
content-script panel and as inbox rows in the popup. Three nudge kinds:

- "break" — fires at the user-configured interval (default 45 min;
  options 20 / 30 / 45 / 60).
- "long_session" — fires when the session crosses 90 min wall-clock.
- "timebox" — fires when a fresh session begins, asking if the user
  wants to set a 25 / 50 min box. Opt-out per nudge.

Voice constraints baked into the copy (mirrored from
`packages/skills/hyperfocus-formatter/SKILL.md`): never the word
"hyperfocus" or "focused" in any user-facing string; suggestions never
commands ("Consider stepping away" not "Take a break"); sentence case;
no exclamation marks. The `pacing-render-text.test.ts` tripwire fails
the build if forbidden language leaks.

Pacing nudges are default OFF for users whose `profile.neurotypes`
contains `ocd` or `audhd` — unsolicited pacing prompts can feed
rumination loops. Those users see a one-time "Enable pacing nudges?"
prompt in the popup home view; default is Not now.

- **New module**: `src/lib/pacing.ts` (pure decision logic) +
  `src/lib/pacing-runtime.ts` (service-worker ticker wiring).
- **New storage key**: `neurodock.pacing.v1` in chrome.storage.local
  (never sync; never leaves the device).
- **New runtime message**: `watchdog:nudge` broadcast from the SW pacing
  ticker; consumed by the new `PacingNudge` toast in
  `entrypoints/_shared/pacingNudge.tsx`.
- **Settings UI**: new Pacing copilot section in `SettingsTab.tsx` with
  enable toggle, interval select, and timebox-on-start toggle.
- **Home UI**: one-time `PacingOptInPrompt` for OCD / AuDHD users.

### Added — accessibility and focus modes (high-contrast theme, keyboard map, distraction-reduced focus mode)

Implements RFC A3. Two persisted preferences land under a new
`neurodock.a11y.v1` key in `chrome.storage.local` (never `sync`):

- **High-contrast theme** — bumps `--nd-color-fg` to pure-ish black on
  pure-ish white (inverted in dark mode), promotes hairlines to bolder
  strokes, and forces the focus ring to 3 pixels. Reuses the existing
  0.0.32 OKLCH token contract; no new colour names introduced. Applied
  via the `:root.nd-high-contrast` and `:host(.nd-high-contrast)`
  variants in `src/styles/tokens.css` plus the in-shadow stylesheet in
  `entrypoints/_shared/mountIsland.ts`, so popup, tab view, and
  every per-site island flip in lockstep.
- **Focus mode** — distraction-reduced surface. Tightens line-height
  from 1.65 to 1.45, caps the tab-view reading measure to ~55ch
  (popup is already tight at 400px), and hides the cloud-mode banner
  while idle (the toolbar icon still carries the cloud signal).
  Collapsibles default closed (already the existing default; the
  toggle reaffirms it).
- **Keyboard-first popup tab bar** — arrow keys (Left/Right/Up/Down)
  cycle through Home / Notifications / Settings with wraparound, and
  Home / End jump to the first / last tab. Implements the WAI-ARIA
  Authoring Practices `tablist` pattern. `tabIndex` rolls so only the
  active tab is in the tab order.
- **Esc closes any open Collapsible** in the in-page result panel,
  whether focus sits on the toggle button or anywhere inside the
  expanded section.
- **Skip-to-content link** in the tab view — visually hidden until
  focused, the first focusable element on the page, jumps past the
  navigation to `#nd-tab-main`.
- **Keyboard map** block at the bottom of Settings → Accessibility
  documents Tab / Enter / Space / Esc / Arrow-keys for users who do
  not already know the convention.

New module: `src/lib/accessibility.ts` (load / save / apply, idempotent
class toggles, accepts both `Document` and `ShadowRoot`).

New component: `entrypoints/popup/AccessibilitySection.tsx`, rendered
inside `SettingsTab` between the existing Provider test and the
Proactive guardrails panel.

`entrypoints/_shared/bootstrap.tsx` now applies the preferences to the
shadow-root host on mount and re-applies on `chrome.storage.onChanged`
so toggling in Settings flips every open island without a tab reload.

Tests added:

- `tests/unit/accessibility.test.ts` — load / save round-trip, default
  fallback, migration of empty storage, garbage-input normalisation,
  idempotent apply on `Document` and on `ShadowRoot`.
- `tests/unit/popup-accessibility-section.test.tsx` — toggle each
  preference, assert chrome.storage.local writes the new shape, assert
  the document classes flip, rehydration from a pre-existing stored
  value.
- `tests/unit/popup-arrow-key-tabs.test.tsx` — arrow keys cycle, Home
  / End jump, unrelated keys pass through, `tabIndex` rolls.
- `tests/unit/tab-skip-link.test.tsx` — link rendered, targets
  `#nd-tab-main`, sits first in DOM order before the AppShell wrapper.

### Added — guided onboarding wizard (provider selection, model validation, profile sync)

First-run users now land on a five-step wizard instead of the bare tab
bar. The wizard explains what NeuroDock does in plain language, lets
the user pick a provider (Local LM Studio, Local Ollama, or Cloud
Anthropic / OpenAI / OpenRouter / Google), validates the configuration
with a real model-list ping, and offers an optional native-host profile
sync hint. On completion (or any skip) the `onboardingComplete` flag is
persisted and the wizard never re-appears.

- **New surface**: `entrypoints/popup/OnboardingWizard.tsx` with five
  steps — Welcome, Provider select, Provider configuration, Profile
  sync, Done. Skip-for-now is available on every step except Provider
  configuration. Progress is shown as `1 of 5` (sentence case, no emoji).
- **Profile shape**: `ExtensionProfile.onboardingComplete?: boolean`
  added to `src/lib/types.ts`. `normaliseProfile()` defaults brand-new
  profiles to `false` so the wizard renders on first popup open.
- **Migration guard**: pre-A1 profiles with any provider already
  configured (cloud key set, per-provider key, cloud provider id, or
  a non-default local endpoint) are stamped `onboardingComplete: true`
  automatically, so an upgrade never re-shows the wizard to an existing
  user.
- **Gate**: `entrypoints/popup/App.tsx` renders the wizard in place of
  the tab bar + content whenever `profile.onboardingComplete !== true`.
  The bottom Profile sync section is hidden while the wizard owns the
  popup (the wizard has its own sync step).
- **Refactor**: `fetchModelsViaWorker` extracted from `SettingsTab.tsx`
  into `src/lib/fetch-models-via-worker.ts` so the wizard can re-use
  the same SW round-trip without duplicating the model picker logic.
- **Tests added**:
  `tests/unit/profile-onboarding-migration.test.ts` (default / migration
  / explicit-honour paths),
  `tests/unit/popup-onboarding-wizard.test.tsx` (wizard renders on first
  run, Skip persists, step transitions, Continue gating),
  `tests/unit/popup-onboarding-skip.test.tsx` (existing users never see
  the wizard).
- **No new colours, no new dependencies.** The wizard reuses the 0.0.32
  design tokens via the existing Tailwind utility aliases (`bg-bg`,
  `text-fg`, `border-hairline`, `text-fg-accent`, …) and the existing
  `chrome.runtime.sendMessage` round-trip to the service worker. No new
  IPC, no analytics, no telemetry.

## 0.0.32

### Changed — visual identity refresh matching docs site

Every popup, tab, content-script panel, and shadow-root island now reads
its colour, type, and motion from a shared token contract that mirrors
`docs/src/styles/tokens.css` verbatim. The refresh standardises the
extension on the same calm-light / dim-dark OKLCH palette the docs site
uses (single neutral accent at hue 250, never pure black, no gradients),
the same `Atkinson Hyperlegible` / `Lexend` / `JetBrains Mono` type
stack, and the same opt-in-only motion default (transitions disabled by
default; 120ms allowed only inside `@media (prefers-reduced-motion:
no-preference)`).

- **Tokens added** (new file `src/styles/tokens.css`): `--nd-color-bg`,
  `--nd-color-bg-nav`, `--nd-color-bg-sidebar`, `--nd-color-bg-inline-code`,
  `--nd-color-fg`, `--nd-color-fg-accent`, `--nd-color-fg-muted`,
  `--nd-color-fg-invert`, `--nd-color-hairline`, `--nd-color-hairline-light`,
  `--nd-color-shade`, `--nd-color-accent` (+ `-low`, `-high`),
  `--nd-color-warn-fg` / `-border` / `-bg`, `--nd-color-error-fg` /
  `-border` / `-bg`, `--nd-font-body`, `--nd-font-heading`, `--nd-font-mono`,
  `--nd-text-{base,sm,lg,xl,2xl,3xl}`, `--nd-line-height`,
  `--nd-line-height-headings`, `--nd-transition-duration`.
- **Surfaces touched**: `entrypoints/popup/{App,SettingsTab,NotificationsTab}.tsx`,
  `entrypoints/popup/styles.css`, `entrypoints/tab/{App.tsx,styles.css}`,
  `entrypoints/_shared/{panel.tsx,mountIsland.ts}`,
  `src/components/{AppShell,OpenInTabButton}.tsx`,
  `src/lib/cloud-mode-banner.tsx`, `tailwind.config.ts`.
- **Tailwind**: `theme.colors` now maps every utility to a CSS custom
  property (`bg: 'var(--nd-color-bg)'` etc.). Hard-coded hex was removed
  from every component. Legacy `neutral.*`, `accent.{light,dark}`, and
  `warn.{light,dark}` keys remain as aliases over the same tokens so
  test fixtures and migration call sites stay green.
- **Hierarchy fixes**: popup tabs use a hairline-separated underline (no
  pill backgrounds). Tab-view left rail uses a left-edge accent instead
  of a background fill. Headers across both surfaces drop the
  `text-3xl` / `text-xl` Tailwind defaults in favour of the two-stop
  scale (22px page titles, 18px section headers, 14px secondary, 16px
  body in popup; 17px body in tab).
- **No more shadows**, **no more gradients**: explicit
  `background-image: none !important` mirrors `docs/src/styles/overrides.css`,
  and the in-shadow `.neurodock-panel` / `.neurodock-button` styles drop
  their `box-shadow` rules. Hairlines only.
- **No ALL CAPS in UI strings**: `content_translation` facet chips
  ("INPUT", "ACTION", …) now render in sentence case ("Input", "Action",
  …) with a hairline outline + monospace font carrying the category
  signal. The chip background fill is gone — outline only. Three test
  files (`image-describe-view-content-translation`,
  `brief-meeting-view-content-translation`, `popup-history-expand`)
  were updated to match.
- **No emoji**: none existed in extension UI before; the constraint is
  documented in the contract.
- **Focus rings**: a global `:focus-visible { outline: 2px solid
var(--nd-color-accent); outline-offset: 2px; }` declared in both
  popup and tab globals catches every interactive element.
- **Status banners** (save-error, silent-fallback, cloud-mode, AuDHD
  hint) now use the calm, desaturated warn / error palette instead of
  Tailwind's `red-*` / `amber-*` scales.

**Icon strategy**: ImageMagick is not available on this build host, so
the PNGs in `public/icon/` are unchanged from 0.0.31. A new
`public/icon/SOURCE.md` documents the regeneration recipe (source SVG
at `docs/public/favicon.svg`, transparent background, 12.5% safe-area
padding, ImageMagick pipeline for `{16,32,48,128,256}.png`) and flags
the 16×16 legibility consideration. Regenerating the PNGs is a
Maintainer follow-up.

**Font bundling**: the docs site loads `Atkinson Hyperlegible`,
`Lexend Variable`, and `JetBrains Mono Variable` via `@fontsource`
packages. To keep the extension air-gappable and avoid adding new
dependencies, the refresh ships system fallbacks only — the named
families are listed first so a host with the fonts already installed
picks them up automatically. Bundling the woff2 files into
`public/fonts/` is a follow-up.

**WCAG contrast ratios** (computed by converting OKLCH → linear-sRGB →
relative luminance and applying the standard `(L_lighter + 0.05) /
(L_darker + 0.05)` formula). All exceed 4.5:1:

| pair                  | light   | dark    |
| --------------------- | ------- | ------- |
| fg on bg              | 16.34:1 | 14.85:1 |
| fg-accent on bg       | 8.67:1  | 10.81:1 |
| bg on accent (button) | 7.00:1  | 7.62:1  |
| fg-muted on bg        | 8.69:1  | 7.59:1  |
| warn-fg on warn-bg    | 8.07:1  | 9.33:1  |
| error-fg on error-bg  | 8.77:1  | 9.21:1  |

Hairline tokens are decorative (not contrast-bound). The opt-in motion
duration stays at 0ms by default and rises to 120ms only when the user
explicitly has `prefers-reduced-motion: no-preference`.

## 0.0.31

### Fixed — `describe_image` / `brief_meeting` now render `content_translation` (UI was silently dropping it)

0.0.30 shipped the prompt + schema rewrite that made the model emit a
per-item Input/Action/Goal `content_translation` scaffold, but the
panel views in `entrypoints/_shared/panel.tsx` were never updated and
still read only the legacy `description` / `inferred_purpose` /
`transcribed_text` / `my_asks` / `decisions` fields — so the model's
ND-actionable output was silently dropped before reaching the DOM, in
both the in-page panel and the popup History row expand (which reuses
the same `ToolView` dispatcher). The two views now read
`content_translation` first, render each entry as a card with the
label as a heading and each facet shown as a small uppercase kind chip
(`INPUT`, `ACTION`, `GOAL`, `RULE`, `FACT`, `BENEFIT`, `CONTEXT`)
followed by its text, and demote the legacy fields into a
closed-by-default "Accessibility metadata" / "Meeting transcript
metadata" collapsible. Decorative imagery and chat-only meetings
(`content_translation: null`) and legacy v0.1.x responses (field
omitted) fall through to the pre-0.0.30 layout unchanged. A one-line
`console.debug` diagnostic in `translation-client.ts` confirms at a
glance whether the model is actually emitting the field on dogfood
runs. No new dependencies, no new colors — reuses the existing
`Section` / `Collapsible` / `TldrCard` primitives.

### Added — in-page translation indicator (spinning near image / cursor, tick or cross briefly on completion)

Right-click translations now render a small Shadow-DOM badge on the page
itself for the duration of the model call. The indicator anchors to the
top-right corner of the right-clicked image for `describe_image`, and to
the captured cursor position for `translate_incoming` text selections.
It spins while the translate is in flight, then morphs into a check
glyph on success (auto-detaches after ~1.5s) or an x glyph on failure
(auto-detaches after ~2s). Pre-`[unreleased]` the only feedback was the
toolbar action badge plus an eventual OS notification — neither felt
like progress on the page where the user just right-clicked. The
indicator honours `prefers-reduced-motion` (static "Translating…" badge
instead of a spin) and announces state changes via `aria-live="polite"`.
Concurrent translations get independent indicators keyed by a
crypto-randomUUID requestId; no host-page CSS injection, no new
permissions.

## 0.0.30 — translate-not-summarize, for real this time

The 0.0.28 ship added a `content_translation` field to the `describe_image`
and `brief_meeting` schemas but the BEHAVIOUR never moved. The user
dogfooded the post-0.0.28 build against a Harness "Feature Flags: An
Essential Guide" doc page (a structured document with a "1. Use Cases"
section, a "Decouple Deployment from Release" subsection, and a code
block) and got back, on two different models:

> "A technical document page describes use cases for feature flags, featuring main text, a code block, and the Harness company logo"
> "Academic whitepaper abstract page displaying five paragraphs of black text and a single bulleted item on a white sheet labeled page five."

Both were OCR/summary outputs. `content_translation` was null or omitted.

Why 0.0.28 didn't move the needle:

1. The prompt's opening line was a one-sentence framing ("you are
   TRANSLATING...") followed immediately by a long schema-describing
   section. Local 4B-class models obey roles; we gave them a schema.
2. The required-keys list put `description` first and added a
   parenthetical demotion of `content_translation`. A model walking the
   list literally filled `description` and treated null as a valid
   completion.
3. The only worked example was an "8 Ways to Display Emotional
   Intelligence" infographic with explicit input/action/goal phrasing
   already present. Document-page screenshots (the case that actually
   broke) had no anchor and fell back to "describe what's on the page".
4. The per-NT addenda were conditional ("when the image has structured
   content, cap entries at N") — never invariant.
5. The schema allowed `content_translation: []` to pass validation — an
   escape hatch a small model could (and did) use.

What 0.0.30 ships:

- `describe_image.prompt.md` rewritten to lead with the user's verbatim
  "Cognitive Accessibility Expert" role + Crucial Rules (DO NOT transcribe
  / DO NOT describe layout / Logic First / Remove Ambiguity). Adds a
  DECORATIVE / INSTRUCTIONAL / DATA-VIZ decision tree that explicitly
  classifies document-page screenshots as INSTRUCTIONAL. Adds a worked
  example for the Harness Feature Flags page (the exact failure case).
  Demotes the legacy `description` / `key_elements` / `transcribed_text`
  fields as "accessibility-tech metadata, NOT the primary output".
- `brief_meeting.prompt.md` rewritten to lead with the same Cognitive
  Accessibility Expert framing; `content_translation` is now the priority
  output and the legacy four sections are accessibility-audit metadata.
- `describe_image.schema.json` and `brief_meeting.schema.json` add
  `minItems: 1` to the array branch of `content_translation`. Empty
  arrays are now rejected; null (decorative / chat-only) remains
  permitted; legacy responses that omit the field still validate. Schema
  version stays v0.2.0 — this is a behavioural tightening, not a
  wire-shape change.
- `neurotype-addendum.ts` now starts every concrete
  `(describe_image, NT)` and `(brief_meeting, NT)` block with the
  invariant: "Always populate `content_translation` with one entry per
  logical item ... Use null ONLY if ...". The content_translation rule
  is the FIRST bullet in each block (was previously last and ignored).

New tests:

- `tests/unit/describe_image_prompt.test.ts` — pins the new framing
  (Cognitive Accessibility Expert, DO NOT transcribe, MUST contain at
  least 1 entry, Harness worked example present, placeholders preserved).
- `tests/unit/neurotype-addendum-content-translation-required.test.ts` —
  every concrete `(describe_image, NT)` and `(brief_meeting, NT)` block
  contains "Always populate" + "content_translation" + "Use null ONLY"
  and places the invariant BEFORE legacy-field rules.
- `tests/unit/validation-content-translation-required.test.ts` — schema
  accepts `null`, accepts populated arrays, accepts the field being
  omitted; rejects `[]`.

Back-compat: legacy `describe_image` / `brief_meeting` responses from
0.0.28 with `content_translation: null` continue to validate. The only
newly-rejected shape is `content_translation: []` which was never useful.

Diagnostic write-up: `.claude-reports/2026-05-25-translate-still-broken/`.

### Fixed — Google Gemini vision allowlist no longer rejects current model slugs (`gemini-pro-latest`, `gemini-3.5-flash`, etc.)

The Google provider's pre-flight vision check hardcoded the
`gemini-1.5` / `2.0` / `2.5` / `2-pro` slug families and rejected
anything outside that window with a misleading `VISION_MODEL_REQUIRED`
error — even when the user picked a current alias like
`gemini-pro-latest`, `gemini-flash-latest`, `gemini-3.5-flash`, or
`gemini-3-pro-preview` that Google's endpoint accepts. The check is
inverted: we now accept any `gemini-*` slug and only fail closed for
the known non-chat Google families (embeddings, AQA), so new Gemini
chat releases work without an extension update. Chose approach B
(widen the allowlist) over dropping it entirely so the user still
gets a clear client-side error when they accidentally pick an
embedding model for image input.

## 0.0.29

### Added — Notifications inbox + Open-in-tab expanded view

Two ND-requested surfaces ship together.

**Notifications inbox.** The popup gets a Notifications tab next to
History. Today the proactive watchdog and translation-fallback paths fire
a `chrome.notifications` toast and that is the whole surface — if the user
dismisses the toast or steps away, it is gone. The inbox lists every
guardrail trip, proactive-watchdog signal, and notification-fallback
translation result, newest first, capped at 200 with LRU eviction. The
user can mark rows read / unread, delete one, or bulk mark-all-read /
delete-all. Per-category mutes (`watchdog:hyperfocus`,
`watchdog:deep_night`, or the entire `watchdog` category) accept
relative-duration syntax (`"1h"`, `"4h"`, `"30m"`) plus a permanent
"Always" option. Muted signals still LAND in the inbox — only the
OS-toast is suppressed — so the user can audit what got quieted while
they were away. The popup refreshes live via a `notifications:updated`
runtime broadcast, mirroring the existing `history:updated` pattern.

New module: `src/lib/notifications.ts`. New component:
`entrypoints/popup/NotificationsTab.tsx`. The proactive watchdog now
records its signal to the inbox before it fires (or skips) the OS toast
based on the mute state. The context-result fallback notification also
mirrors into the inbox. Records live in `chrome.storage.local` only —
never `sync`, same privacy contract as History.

**Open in tab.** The popup is cramped — many features need more room
than ~400×600 Chrome gives us. A new "Open in tab" button in the popup
header opens a full-page view at `chrome.runtime.getURL("tab.html")`
sharing the SAME stores and data layer as the popup. Tab view uses a
~1200px max-width layout with a left rail (Home / History / Settings /
Notifications), 17px body / 1.65 line-height, and ~70ch reading measure.
History rows render expanded by default (no click-to-expand). Hash
protocol supports `#view=home|history|settings|notifications` so the
popup can pre-select the same section.

New entrypoint: `entrypoints/tab/` (registered as a
`web_accessible_resource`). New shared shell: `src/components/AppShell.tsx`,
`useAppData.ts`, `OpenInTabButton.tsx`. No data duplication — popup and
tab read the same storage.

Both surfaces are keyboard-first, honour `prefers-reduced-motion`, and
introduce no new dependencies or new colors.

## 0.0.28

### Changed — `describe_image` and `brief_meeting` translate, not summarise

User dogfooded `describe_image` on an "8 Ways to Display Emotional
Intelligence" infographic. The output was OCR-shaped:

> An infographic on emotional intelligence presents 8 methods …

What the user actually wanted was a per-point Input/Action/Goal scaffold
they could act on. Diagnosis: the v0.1.0 output schema had nowhere to put
that scaffold — `description` is capped at 600 chars / 3 sentences,
`key_elements` is a flat noun list. No amount of prompt tweaking could
emit a shape the schema forbids.

Same disease on `brief_meeting`: flat `my_asks[]` / `decisions[]` / etc.
give you the WHO-SAID-WHAT but not the WHAT-TO-DO scaffold.

0.0.28 ships:

1. **Schema bump to v0.2.0** for both surfaces. New optional field
   `content_translation: TranslatedEntry[] | null` on `describe_image`
   and `brief_meeting`. Each entry has a `label` and 1–8 `facets`, where
   each facet is `{ kind, text }` and `kind` is one of `input`,
   `action`, `goal`, `rule`, `fact`, `benefit`, `context`. Additive —
   legacy responses (without the field) still validate.

2. **Prompt rewrite** for `describe_image`. The model is now told it
   is TRANSLATING the image, not describing it. A counter-example
   citing the EI infographic teaches the difference between OCR
   ("the infographic shows 8 methods") and translation (8 entries
   with Input/Action/Goal facets per method). `brief_meeting` gets a
   smaller additive instruction for the same field.

3. **Per-neurotype matrix updates** in `src/lib/neurotype-addendum.ts`.
   Every concrete (`describe_image` × NT) and (`brief_meeting` × NT)
   block now teaches the model how to shape `content_translation`:

   - ADHD: verb-led, 8 words / facet, cap at `maxChunkSize`.
   - ASD/autism: literal commitments, source-label verbatim, idiom decode.
   - AuDHD: fused — verb-led + literal, no idioms, cap.
   - OCD: low-pressure phrasing in `action`/`rule` facets.
   - Dyslexia: ≤15 words / facet, common words, no semicolons.
   - Dyspraxia: source-image order, absolute dates, no "as above".

4. **Tests.**

   - `validation.test.ts`: legacy-without-field validates (back-compat),
     new-with-field validates, decorative `null` validates, unknown
     facet `kind` rejected.
   - `neurotype-tool-matrix.test.ts`: every concrete describe_image and
     brief_meeting NT block must mention `content_translation`.

5. **Sample outputs** for the EI infographic across all 6 NTs at
   `.claude-reports/2026-05-25-translate-not-summarize/SAMPLE-OUTPUTS.md`.

Schema change is back-compat. Storage trust boundary unchanged — keys
still live in `chrome.storage.local` only, never `sync`. AGPL-3.0-or-later
header preserved.

## 0.0.27

### Fixed — Cloud API keys are now per-provider (privacy + UX)

User-reported: after configuring OpenRouter, switching to "Cloud Google"
in Settings showed the OpenRouter API key under the Google label —
because the extension stored ONE `cloudApiKey` shared across all
cloud providers.

Two problems with the old shape:

1. **Privacy footgun.** The OpenRouter key (visible as `••••last4`)
   was rendered under "Cloud Google" while Google was selected.
   Whatever audience was looking at the screen got the wrong key
   attributed to the wrong provider.
2. **UX trap.** Hitting Save in that state would overwrite the
   OpenRouter key with whatever was typed for Google. Switching
   back to OpenRouter would find an empty key field.

0.0.27 introduces `cloudApiKeys: Readonly<Record<string, string>>`
on `ExtensionProfile`. Each provider's key lives at its own key.
Switching from OpenRouter to Google now shows an empty key field
for Google AND keeps the OpenRouter key around for the next time you
toggle back.

**Migration:** the legacy single `cloudApiKey` is preserved as a
denormalised pointer to the active provider's key. On profile load,
if `cloudApiKeys` is empty but the legacy `cloudApiKey` is set, it's
back-filled into `cloudApiKeys[cloudProvider]`. No re-enter required
when upgrading from 0.0.26.

Two regression tests pin the contract:

- `preserves other providers' keys when clearing a single provider`
- `saving a Google key preserves an existing OpenRouter key`

Storage trust boundary unchanged — keys still live in
`chrome.storage.local` only, never `sync`.

## 0.0.26

### Added — Google Gemini as a fourth cloud provider

New cloud option in Settings: **Cloud Google (Gemini)**. Pattern-matches
the existing OpenRouter provider — Google ships an OpenAI-compatible
endpoint at `generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
so the wire format is reused with `Authorization: Bearer <api_key>` and
the same SSE shape.

- Default model: `gemini-2.0-flash` (fast, cheap, vision-capable). Refresh
  models populates the dropdown from Google's `/models` endpoint; the
  fetcher filters non-chat variants (embeddings, AQA) automatically.
- Vision: Gemini accepts both http(s) URLs and base64 data URLs, so the
  SW does NOT pre-fetch image bytes (unlike LM Studio). The image URL
  passes through verbatim.
- Errors normalised with `GOOGLE_*` prefix — `GOOGLE_AUTH_FAILED` (401),
  `GOOGLE_MODEL_NOT_FOUND` (404), `GOOGLE_RATE_LIMITED` (429),
  `GOOGLE_HTTP_<status>`, `GOOGLE_UNREACHABLE`.
- `response_format: json_object` retry dance for Gemini models that
  reject it — mirrors the OpenRouter pattern.
- New CSP `connect-src` + `optional_host_permissions` entries for
  `generativelanguage.googleapis.com`. Same trust boundary as the
  other cloud providers (cloud-mode banner + opt-in via Settings).

Get an API key from <https://aistudio.google.com/app/apikey>.

### Fixed — Provider responses with extra top-level fields no longer fail validation

User-reported bug with OpenRouter routing to Gemini:

```
LLM_OUTPUT_VALIDATION_FAILED: model response did not match the expected
schema. Retry to try again. ((root): must NOT have additional properties)
```

Gemini (direct or via OpenRouter) sprinkles top-level metadata fields
(`safety_ratings`, `citations`, `groundings`, `finish_reason`) into
completions. Our schemas use `additionalProperties: false`, so AJV was
rejecting otherwise-correct responses purely for provider chatter we
don't consume.

`normaliseLLMOutput` in `validation.ts` now strips top-level keys that
aren't in the per-tool schema's allowed-property set BEFORE validation
runs. The allowed-key sets are computed at module load from the same
schemas we already ship — no schema change, no widening of what we
accept; we just stop failing on noise we ignore anyway.

New regression test pins the contract:
`tests/unit/validation.test.ts > strips provider-added top-level fields
before validation`.

### Combined with 0.0.25 (per-tool addenda)

0.0.25 shipped the per-tool per-neurotype addenda + reposition + debug
log toggle. 0.0.26 includes everything in 0.0.25 plus the two items
above. 316 tests passing (276 + 8 new google provider + 12 validation

- 20 per-tool matrix).

## 0.0.25

### Fixed — neurotype prompt addenda now actually differentiate

User-reported bug: describing the same image with ADHD vs dyslexia vs
"all neurotypes toggled" produced three near-identical outputs,
differing only in surface phrasing. Three compounding root causes:

**A: Addenda were too generic.** The 0.0.22 `buildNeurotypeAddendum`
emitted tool-agnostic rules ("lead with the verdict in the first
phrase"). For `describe_image` the model couldn't attach a generic
rule to a specific schema slot (`description` vs `key_elements` vs
`inferred_purpose`).

**B: Addendum was sandwiched between rendered template and schema.**
The JSON schema block was the LAST instruction the model read. Small
local models (gemma-4-e4b at 4B params is the user's daily driver)
anchor on the most-recent + most-concrete instruction, so the schema
won and the addendum was ignored.

**C: The base prompt was already neurodivergent-tuned.** `describe_image.prompt.md`
already mandates "literal first, no metaphor, no emotional
interpretation", so the generic ASD / dyslexia addenda added little
incremental signal.

**Fix:**

1. `buildNeurotypeAddendum(profile, tool?)` now dispatches on
   `(tool, neurotype)` to per-pair concrete blocks that reference
   actual schema field names. Five tools × six effective neurotypes
   (Tourette is no-op, AuDHD is fused, `other` is free-form) = 30
   concrete blocks. Each block ≤ 25 lines.

2. `buildPrompt` reorders the prompt so the addendum is appended
   AFTER the schema block, with a new "Reader-specific overrides
   (apply LAST, after the schema)" header. The addendum is now the
   last instruction the model reads before emitting JSON.

3. New honest-UI note inside the `<ReaderPreferences>` fieldset:
   "Reader preferences shape the prompt sent to the model. Larger
   models honor them better than smaller ones. With a 4B local model
   (e.g. gemma-4-e4b) you may see only subtle differences between
   neurotypes; with cloud mode or a 7B+ local model the
   differentiation is stronger."

### Added — Debug Tools panel with prompt-log toggle

New `<DebugTools>` fieldset in Settings (between Proactive Guardrails
and Reader Preferences). One toggle: **Log final prompt to console**.

- Reads/writes `chrome.storage.local["neurodock.debug.logPrompts"]`.
- Default OFF; explicit user opt-in required.
- When enabled, every provider (Ollama, LM Studio, Anthropic, OpenAI,
  OpenRouter) prints the fully-assembled prompt
  (template + input + schema + addendum) to the service-worker
  DevTools console immediately before fetch.
- Local-only: nothing leaves the device.
- Helps diagnose user reports of "the addendum isn't doing anything"
  by surfacing the exact prompt the model sees.

The shared helper lives at
[`src/lib/providers/debug-log.ts`](src/lib/providers/debug-log.ts) and
caches the flag in-memory with `chrome.storage.onChanged` live
updates so we don't hit storage on every translate call.

### Tests

40 new tests in
[`tests/unit/neurotype-tool-matrix.test.ts`](tests/unit/neurotype-tool-matrix.test.ts)
asserting:

- For every (tool, neurotype) concrete pair (30 pairs): the addendum
  references at least one schema field name from that tool AND at
  least one neurotype-specific fingerprint.
- For five different tools: three different neurotypes produce
  textually distinct addenda (cheap differentiation check).
- For `describe_image`: ADHD vs dyslexia vs ASD each contain a
  fingerprint substring the others lack
  (`"noun phrase, not a sentence"`, `"15 words"`, `"BEFORE writing"`).
- Tool-less overload still works (back-compat).
- AuDHD substitution + Tourette no-op + `other` notes-passthrough
  semantics still hold when a tool argument is supplied.

`prompt-builder.test.ts` JSON-fence assertion no longer anchors to
end-of-string since the addendum may now follow the fence. All other
tests pass unchanged. **316/316 tests pass (was 290).**

## 0.0.24

### Fixed — LM Studio + Gmail silent failure (the #1 outstanding bug)

Translations on long Gmail threads streamed to 100 % in LM Studio but
the result never reached the panel or the popup — silently lost.
Two compounding root causes:

**A: MV3 service-worker idle kill mid-fetch.** `runTranslate` awaited
the translate call directly. On long Gmail bodies the LM Studio
round-trip exceeded the ~30 s MV3 SW idle threshold; Chrome killed
the SW mid-fetch (network request kept streaming on the wire, but
the `await` never resolved because the SW context was gone). No
`appendHistory`, no `tabs.sendMessage`, no notification — nothing.

**B: `chrome.tabs.sendMessage` ambiguous resolution.**
`dispatchContextResult` treated any non-rejecting resolution as
proof the content-script panel had received the message. Chrome
resolves with `undefined` in two indistinguishable cases: a listener
fired and returned without `sendResponse`, OR no listener actually
ran (SPA-navigation race, stale port after SW restart). The SW
thought it had delivered, returned, the user saw nothing.

**Fix:**

1. New [`src/lib/sw-keepalive.ts`](src/lib/sw-keepalive.ts) —
   `withKeepalive(fn)` pings `chrome.runtime.getPlatformInfo` every
   20 s while the wrapped operation runs, defeating the MV3 idle
   kill. `runTranslate` now wraps the `translate()` call in it.
2. New ACK contract: `dispatchContextResult` requires the reply to be
   exactly `{ ack: true }`. Absent the ACK, the existing generic-
   injection retry + notification fallback chain fires. The user
   always sees something — panel OR notification carrying the
   result preview.
3. The content-script listener in `contentApp.tsx` now explicitly
   calls `sendResponse({ ack: true })` after applying state.

Seven new regression tests in `tests/unit/background-gmail-silent-failure.test.ts`
plus updates to three existing test files. 260/260 tests pass.

### Added — Settings UI for Proactive Guardrails

New `<ProactiveGuardrails>` fieldset in the Settings tab between
**Test connection** and **Reader preferences**. Surfaces:

- **Extension watchdog** toggle — reads/writes
  `chrome.storage.local["neurodock.watchdog.enabled"]`. Default-on
  (only literal `false` disables). Reverts UI on persist failure.
- Read-only info block for **Claude Code hook (Phase 1)** with the
  `neurodock install-hooks --self-test` install command and the
  `export NEURODOCK_GUARDRAILS=off` opt-out, both in `<code>` blocks.
- Read-only info block for **Standalone daemon (Phase 3)** with the
  `neurodock install-hooks --install-daemon` command.

Four new tests in `tests/unit/settings-tab.test.tsx` (default-on
semantics, explicit-disable rendering, click → set behaviour, opt-out
copy present).

## 0.0.23

### Added — Proactive watchdog in the service worker (Phase 2)

The background SW now runs a `setInterval` (default 5 min) that reads
the local IndexedDB translation history and evaluates three
auto-fired signals:

- **Hyperfocus** — ≥12 translations in 30 min.
- **Deep-night** — local time 00:00–05:59 AND ≥1 translation since
  midnight.
- **Rumination on a single host** — ≥8 translations on the same host
  in the last hour.

When a signal trips, the extension shows a `chrome.notifications`
toast and flips the toolbar badge amber until the next translation.
Per-signal-kind dedup (15 min window) so a fast tick after a dismiss
doesn't re-fire the same nudge.

Opt-out per browser:

```js
await chrome.storage.local.set({ "neurodock.watchdog.enabled": false });
```

The full design is documented at
[`docs/concepts/proactive-guardrails`](../../docs/src/content/docs/concepts/proactive-guardrails.mdx).

### Added — Panel works on ANY site (generic content-script injection)

Pre-0.0.23 the panel only auto-mounted on the nine declared
host-permissions sites (Gmail, Slack, Linear, Notion, GitHub, Google
Docs, Outlook variants). Right-clicking on LinkedIn etc. ran the
translation correctly but fell back to a notification — the user had
to dig through History to read the result.

The SW now ships a `content-scripts/generic.js` bundle that's NOT
auto-injected (declared with `matches: []` and
`registration: "runtime"`). When `chrome.tabs.sendMessage` rejects
because no island is mounted, the SW calls
`chrome.scripting.executeScript({ files: ["content-scripts/generic.js"] })`
to inject it on demand, waits 250 ms for the React island to mount,
and retries the message.

Requires that the user has granted host permission for the active tab —
true after either the per-host right-click prompt or
**Enable for every site** in Settings.

### Internals — Watchdog covered by unit tests

`src/lib/proactive-watchdog.ts` has 247-test coverage including
hyperfocus / deep-night / rumination-host signal-evaluation cases and
the setInterval lifecycle with fake timers.

## 0.0.22

This release is the dogfood-driven response to a 4-hour session that
ran past midnight on extension fixes — during which **none** of
NeuroDock's safety surfaces (chronometric breaks, hyperfocus warnings,
rumination flags) auto-fired. Two pieces shipped: concrete extension
fixes the user logged (CSP, JSON truncation, panel UX, per-neurotype
prompts), AND a proposal + prototype for proactive guardrails that
push instead of waiting for the user to pull.

### Added — Per-neurotype prompt tailoring (the big one)

Pre-0.0.22 every prompt addressed "a neurodivergent reader" as one
undifferentiated audience. A dyslexic user got the same dense 3-line
`explicit_ask` as an ADHD user got the same 5-deep `likely_subtext`
list as an ASD user got idiom-laden "warm" rewrites.

A 2026-05-24 prompt-evaluation agent produced
[`.claude-reports/2026-05-24-prompt-neurotype-tailoring/REPORT.md`](../../.claude-reports/2026-05-24-prompt-neurotype-tailoring/REPORT.md)
which audited all five prompts per neurotype and recommended
per-neurotype addenda. Implementation:

- New `buildNeurotypeAddendum(profile)` in
  [`src/lib/neurotype-addendum.ts`](src/lib/neurotype-addendum.ts).
  Returns an empty string for the all-default profile so existing
  installs see no prompt change until they opt in.
- Threaded into `buildPrompt` between the rendered template and the
  JSON-schema suffix, so the model reads the per-neurotype rules in
  time to shape its response.
- Eight neurotype blocks: ADHD (answer-first, cut qualifiers), ASD
  (literal, no idioms, verbatim quotes), AuDHD (fused — substitutes
  ADHD+ASD rather than concatenating), OCD (low-pressure phrasing,
  no urgency vocab), dyslexia (≤15-word sentences, plain words),
  dyspraxia (absolute dates, low sequencing burden), Tourette
  (explicit no-op — UI motion already handled), other (free-form
  notes).
- All `{max_chunk_size}` placeholders are interpolated to the user's
  configured list cap (default 5, schema permits up to 20).
- Combination rules: 3+ neurotypes append a "prefer the more
  conservative reading" footer; `other` is always emitted last so
  user-authored notes are the final word.
- Schemas are unchanged — all tailoring fits inside existing v0.1.0
  bounds.

### Added — Settings UI for neurotypes + preferences

New "Reader preferences" fieldset in the Settings tab surfaces:

- Eight-neurotype checkbox grid with hints.
- Smart AuDHD hint when the user picks both ADHD and ASD.
- Output-format radio (`answer_first` / `conventional` /
  `bullet_first`).
- Max-list-items number input (1..20).
- Additional-notes textarea (500-char cap).

`ExtensionProfile` now carries `neurotypes`, `outputFormat`,
`maxChunkSize`, `additionalNotes`. The on-disk mapper
`mapOnDiskProfileToExtension` was extended to read these from the
yaml (it previously dropped them silently and read only
`identity.display_name`), and `mapExtensionProfileToOnDisk` now
round-trips them so native-host users no longer get neurotypes wiped
to `[]` on every Settings change.

### Added — Toolbar icon progress + outcome badge

The browser-toolbar action icon now reflects translation state:

- `…` (neutral) while translating — gemma-4-e4b on a big image takes
  8-20s; pre-0.0.22 the icon stayed inert and users thought the
  right-click was lost.
- `✓` (green) on success, auto-clears after 4s.
- `m` (amber) on mock-fallback, auto-clears after 4s.
- `!` (red) on error, auto-clears after 8s.

State-driven via [`src/lib/action-badge.ts`](src/lib/action-badge.ts).
Title hover text mirrors state for screen-reader users; badges scope
per-tab so a translation in tab A doesn't visually overwrite the
outcome from tab B.

### Fixed — LinkedIn / gemma JSON truncation

Image translations against gemma-4-e4b were returning truncated JSON
on complex images:

```
LLM_OUTPUT_VALIDATION_FAILED: JSON parse error: Expected ',' or ']'
after array element in JSON at position 864 (line 6 column 49)
```

Two changes:

1. **Explicit `max_tokens: 4096`** in the LM Studio request body
   ([`providers/lmstudio.ts`](src/lib/providers/lmstudio.ts)). The
   server's default of 256 tokens was the root cause — fine for short
   text translations, ruinous for image descriptions.
2. **Structural JSON repair** in
   [`validation.ts:repairTruncatedJson`](src/lib/validation.ts).
   Walks the input balancing brackets and quotes; on JSON-parse
   failure, attempts a repair before giving up. Recovers the partial
   result the user would otherwise lose.

### Fixed — CSP blocked images on local HTTP dev servers (0.0.21 follow-up)

Right-click describe on `http://127.0.0.1:8000/...` now works
end-to-end. The 0.0.21 CSP only allowed `https:` and `data:` for
arbitrary images; this release adds `http:` to the `connect-src`
allowlist (symmetric with `https:`; still gated by
`optional_host_permissions` at the runtime layer).

### Fixed — Notification copy when the panel can't open in-page

Pre-0.0.22 the notification told users to "open extension settings"
when the panel couldn't open on a non-supported host — but Settings
has no surface for adding hosts (it's a content-script injection
scope issue, not a permissions issue), so the advice wasted clicks.

The notification now:

- Distinguishes between "site not in auto-inject list" and "panel
  couldn't reach this tab (try reloading)" — honest about which
  failure mode applies.
- Carries a tool-aware preview of the actual result (description
  for image, explicit ask for text, tone score summary, etc.) so
  the user gets value out of the notification itself.
- Only suggests checking History when History is actually on; when
  History is off, suggests turning it on.

### Added — Proposal for proactive guardrails

The user's 2026-05-24 00:38 message:

> "We deploy all these changes but then it's really on the user to
> actively type commands and phrases to make use of the guardrails
> and protections we put in place in NeuroDock, instead we should be
> able to have NeuroDock detect all interactions and know when to
> intercept. This last 24hours just proved the value of everything
> we built is not working if I am able to non stop work on this…"

…landed as a concrete proposal at
[`.claude-reports/2026-05-24-proactive-guardrails/PROPOSAL.md`](../../.claude-reports/2026-05-24-proactive-guardrails/PROPOSAL.md)
with a Phase-1 prototype Claude Code hook
(`SessionStart` / `PreToolUse` / `PostToolUse` / `Stop`) that
auto-fires chronometric + guardrail checks every N tool uses, without
the user having to remember to call them.

Wiring instructions are in the proposal. The prototype lives in
that report directory pending review.

## 0.0.21

### Fixed — CSP blocked images on local HTTP dev servers

Right-clicking an image on `http://127.0.0.1:8000/...` (or any
non-port-restricted HTTP host) was blocked at the CSP layer:

```
Connecting to 'http://127.0.0.1:8000/files/.../candidate.png' violates
the following Content Security Policy directive: "connect-src 'self'
http://localhost:11434 http://127.0.0.1:11434 ... https: data:".
The action has been blocked.
```

The 0.0.18 CSP had `https:` and `data:` umbrellas for image fetches
but no matching `http:` umbrella — so ML output samples, asset-pipeline
previews, and any LAN-hosted asset store fell straight through to the
mock fallback with no actionable error. Added `http:` to the
`connect-src` allowlist. Symmetric with the existing `https:` entry;
still gated by `optional_host_permissions` at the runtime layer, which
the user grants per-host on right-click.

### Fixed — History rows are now click-to-expand

Pre-0.0.21 the History tab listed `describe_image · 2026-05-23 · local
· lmstudio` rows that weren't interactive, while right-click
notifications cheerfully told users to "open History to read the
result." That was a dead-end: the row only carried metadata, not the
actual translation, so clicking did nothing and the user reasonably
concluded the feature was broken.

Two-part fix:

1. **History entries now carry the full request + response**
   (`HistoryEntry.request` / `HistoryEntry.response` — both optional
   for back-compat with rows written before 0.0.21). Canvas-snapshot
   `data:` URLs are sanitised out so we don't balloon IndexedDB.
2. **Rows expand on click** into the same structured `ToolView` the
   in-page panel uses — description, key elements, transcribed text,
   subtext, action card, tone bars, etc. For image rows the source
   preview also renders a thumbnail of the actual image so you can
   tell which one a row refers to without leaving the popup.

The notification fallback copy now reads the live `historyEnabled`
flag and only suggests checking History when History is actually on —
otherwise it suggests turning History on.

### Added — Source preview shows the actual image, not just the URL

For right-click → "describe image" translations, the source preview in
the in-page panel and the popup History detail now renders a small
inline `<img>` thumbnail of the original image alongside its URL. When
several similar avatars or thumbnails sit next to each other on a
page, you could previously only see a URL string and had to guess
which one you described.

## 0.0.20

### Fixed — `LLM_OUTPUT_VALIDATION_FAILED` on local-model image descriptions

`describe_image` requests against local vision models (gemma-4-e4b,
Qwen2-VL) were succeeding at the model layer but failing schema
validation with:

```
LLM_OUTPUT_VALIDATION_FAILED: ...
must have required property 'eval_corpus_slice';
must have required property 'model_provenance';
/contains_text: must be boolean
```

The schemas mark `eval_corpus_slice` and `model_provenance` as required
_output_ fields, but per ADR 0005 these are **server-owned** — the
model has no honest way to produce them (the provenance is what the
server knows about which model answered; the corpus slice is a CI
marker). Asking the model to invent the values via prompt was the
wrong shape; small local models also routinely return `contains_text`
as a string ("true"/"false") rather than a boolean.

Fix: a new `normaliseLLMOutput()` step in `validation.ts` runs between
JSON parse and schema validation. It:

- Injects `model_provenance` from the actual provider/model that
  answered, when the model omitted it.
- Injects `eval_corpus_slice` with the canonical per-tool identifier
  (e.g. `"describe_image-v0.1.0"`) when the model omitted it.
- Coerces `contains_text` from string-boolean to boolean, defaults
  missing optional arrays/null fields to their schema-shaped values.

The public schema contract still holds — the server guarantees these
fields, the validator still runs, and a genuinely malformed response
(missing `description`, wrong types we can't coerce) still fails
loudly.

### Added — canvas snapshot fallback for inaccessible / wrong-format images

Right-click → "describe image" now snapshots the rendered `<img>` from
the page into a base64 PNG **before** falling back to fetching the
URL. This handles three previously broken paths:

- **Auth-gated CDN images** (private repo avatars, signed S3 URLs the
  SW has no cookies for): the page already has the bytes, the
  snapshot uses them directly.
- **SVG images**: most vision models can't read raw SVG. The canvas
  rasterises the rendered SVG into a PNG the model can actually parse.
- **Expired signed URLs**: the same URL might 404 by the time the SW
  fetches it; the snapshot uses the bytes the browser cached.

Flow (`background.ts` → `dispatchImageTranslate`):

1. SW sends `{type: "image:snapshot", imageUrl}` to the tab.
2. Content-script `installImageSnapshotHandler` (in `_shared/imageSnapshot.ts`)
   locates the matching `<img>`, draws it to an offscreen canvas, and
   returns `toDataURL('image/png')`.
3. SW uses the data URL as `input.image_url` if the snapshot succeeded;
   otherwise it falls back to the existing 0.0.17 URL-fetch path so
   behaviour degrades gracefully when the canvas is CORS-tainted or no
   content-script island is mounted.

The in-panel "source preview" still shows the original URL so the
user can verify which image was processed.

## 0.0.19

### Fixed — image-translation permission prompt never fired

0.0.18 added `chrome.permissions.request` to the context-menu handler
to prompt the user for image-host access, but the listener was `async`
and awaited `permissions.contains` BEFORE calling `request`. MV3
service workers consume the user-gesture context at the first `await`
— by the time `request` fired, the gesture was gone, Chrome rejected
with `"must be called during a user gesture"`, and the prompt never
appeared. The user saw `IMAGE_PERMISSION_DENIED` with no way to grant.

Resolution: the context-menu listener is now synchronous up to the
`permissions.request` call (callback-style, no awaits before it). The
pre-flight `contains` check was removed — `request` is a no-op when
permission already exists, so the optimisation wasn't worth losing the
gesture. The text-translation branch returns its dispatch promise so
existing tests still work without microtask hacks.

### Added — "Enable for every site" Settings button

Right-click prompts you per-site every time you describe an image on a
new host. For users who want a single broad grant instead, Settings
now has an **Image translation** section with a button that requests
the `https://*/*` host pattern once. Revocable from the same panel.
Both flows coexist — pick per-site for the privacy-conservative path,
or all-sites for the convenience path.

### Notes on related observations

- The `'url' field must be a base64 encoded image` error from LM Studio
  was the old code path before the permission grant landed (the SW
  fetch failed silently, the URL was passed through, LM Studio
  rejected). Once a grant is in place the 0.0.17 base64 conversion
  fires correctly.
- The SVG warning is a real model limitation — most vision models can't
  read raw SVG bytes. We continue to attempt the request but warn in
  the console.

## 0.0.18

### Fixed — CSP / host permissions blocked image fetches on arbitrary HTTPS sites

0.0.17 fetched images in the service worker so local-LLM vision models
could receive base64 data URLs. That fetch was blocked by the extension's
own CSP whenever the image was on a host not in our narrow `connect-src`
allowlist:

```
Connecting to 'https://huggingface.co/.../logo.svg' violates the
following Content Security Policy directive: "connect-src 'self'
http://localhost:11434 http://localhost:1234 ..."
```

Two-part fix:

1. **`wxt.config.ts`** — `connect-src` widened to include `https:` and
   `data:`. Specific known hosts kept for clarity but the `https:` umbrella
   lifts the CSP block for arbitrary HTTPS image hosts. `optional_host_permissions`
   gains `https://*/*` (alongside the existing `http://*/*`) so the user
   can grant a specific host at runtime.

2. **`background.ts`** — when the user right-clicks `describe image`,
   the SW now requests optional `host_permission` for that image's
   origin BEFORE running the translate. Right-click is a user-gesture
   context so `chrome.permissions.request` can prompt; the granted
   host sticks until the user revokes it from Settings → Host
   permissions. If the user denies, the panel renders a clear
   `IMAGE_PERMISSION_DENIED` error pointing back at the prompt.

`data:` URLs short-circuit the permission check (no host).

The previous fall-through behavior (fetch silently fails → translation
falls back to mock) is now an actionable error. Combined with 0.0.17's
mock-label fix you can tell at a glance whether you're seeing a real
translation or a stub.

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
