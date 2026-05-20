# @neurodock/extension-browser

NeuroDock browser extension. Manifest V3. Chrome, Edge, Firefox. Built with [WXT](https://wxt.dev).

This package delivers Area 2 (communication translation) per .

## What it does (v0.0.1)

- Floats a non-intrusive "Translate" button on text fields across Gmail, Slack web, Linear, Notion, GitHub, Google Docs, and Outlook web.
- Adds a right-click context-menu action ("NeuroDock: translate selection") on any selected text within a permitted site.
- Opens a popup with:
  - Mode toggle: local (default) or cloud (opt-in only).
  - Local-only history toggle (off by default; metadata-only when on).
  - Cloud provider id input.
- Runs the four translation tools defined by the MCP twin (`translate_incoming`, `check_tone`, `rewrite_outgoing`, `brief_meeting`) using the **same prompt library** as `packages/mcp-translation`.

### What v0.0.1 does NOT do (deferred to v0.0.2+)

| Feature                                                | Status                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Real local Ollama wiring (HTTP call)                   | Deferred — v0.0.1 returns a clearly-labelled MOCK response in local mode.                |
| Real cloud provider integration (Anthropic, OpenAI)    | Deferred — v0.0.1 surfaces `CLOUD_NOT_WIRED` errors when cloud mode is fully configured. |
| Native messaging bridge to `~/.neurodock/profile.yaml` | Deferred — v0.0.1 stores profile state in `chrome.storage.local` only.                   |
| Browser store submission scripts                       | Deferred.                                                                                |
| E2E Playwright suite against the loaded extension      | Deferred — Vitest covers units in v0.0.1.                                                |
| `axe-core` automated runs in CI                        | Deferred — components are written to be a11y-clean and reduced-motion-by-default.        |

## Privacy model

The extension defaults to **local mode** with **NO remote network calls**. Specifically:

- The default manifest requests host_permissions for the seven supported sites only. No `<all_urls>`. No third-party API origins by default.
- The user must explicitly enable cloud mode in the popup and confirm a provider id.
- When cloud mode is on, a persistent banner is rendered in the popup AND in every content-script island. It cannot be dismissed without switching back to local.
- History storage is off by default. When enabled, only metadata + a 256-character preview is stored. The DB is extension-scoped IndexedDB; no remote sync exists.

## Supported sites and content-script entrypoints

| Site        | Match                                                             | Entrypoint                       | Channel   |
| ----------- | ----------------------------------------------------------------- | -------------------------------- | --------- |
| Gmail       | `https://mail.google.com/*`                                       | `entrypoints/gmail.content.ts`   | `email`   |
| Slack web   | `https://app.slack.com/*`                                         | `entrypoints/slack.content.ts`   | `slack`   |
| Linear      | `https://linear.app/*`                                            | `entrypoints/linear.content.ts`  | `linear`  |
| Notion      | `https://www.notion.so/*`                                         | `entrypoints/notion.content.ts`  | `notion`  |
| GitHub      | `https://github.com/*`                                            | `entrypoints/github.content.ts`  | `github`  |
| Google Docs | `https://docs.google.com/*`                                       | `entrypoints/gdocs.content.ts`   | `gdocs`   |
| Outlook web | `outlook.live.com`, `outlook.office.com`, `outlook.office365.com` | `entrypoints/outlook.content.ts` | `outlook` |

## Architecture

```
entrypoints/
├── background.ts                  Service worker. Context menu + message router.
├── popup/                         React popup. Profile + history UI.
│   ├── index.html
│   ├── main.tsx
│   ├── App.tsx
│   └── styles.css
├── <site>.content.ts              One script per site. Calls bootstrapContent().
└── _shared/                       Shared content-script primitives.
    ├── bootstrap.tsx              Loads profile, mounts island, sends messages.
    ├── contentApp.tsx             Top-level React app for in-page UI.
    ├── floatingButton.tsx         Non-modal floating button.
    ├── panel.tsx                  Result panel with cloud-mode banner.
    ├── mountIsland.ts             Shadow DOM host + minimal style sheet.
    └── selectionWatcher.ts        Editable-focus + SPA-aware DOM observer.

Note: WXT discovers content scripts via the `*.content.[jt]s` glob at the
top of `entrypoints/`, so per-site scripts must live there, not in a
sub-directory. The shared module set is named `_shared` so WXT's discovery
glob skips it (leading underscore is treated as private).

src/
├── lib/
│   ├── translation-client.ts      The ONLY model boundary (mock / local / cloud).
│   ├── profile.ts                 Extension-scoped profile in chrome.storage.local.
│   ├── storage.ts                 Local-only IndexedDB history (off by default).
│   ├── cloud-mode-banner.tsx      Persistent cloud-mode banner (popup).
│   ├── types.ts                   Internal TypeScript surfaces.
│   └── prompts/                   Synced at build time from mcp-translation.
└── ...

scripts/
└── sync-prompts.ts                Copies prompts from mcp-translation. Runs pre-build.

tests/
├── setup.ts                       chrome.* shim, fake-indexeddb.
└── unit/                          Vitest units.
```

## Quickstart

From the repo root:

```sh
pnpm install
pnpm --filter @neurodock/extension-browser dev          # Chrome dev profile (auto-loads)
pnpm --filter @neurodock/extension-browser dev:firefox  # Firefox dev profile
pnpm --filter @neurodock/extension-browser dev:edge     # Edge dev profile
```

Production builds:

```sh
pnpm --filter @neurodock/extension-browser build        # all three targets
```

Output lands in `.output/<target>-mv3/`.

## Tests

```sh
pnpm --filter @neurodock/extension-browser test
```

Vitest covers:

- `profile.test.ts` — defaults, save/load, mode gating.
- `translation-client.test.ts` — mock mode, cloud-mode gating, URL channel detection.
- `selectionWatcher.test.ts` — editable detection, password-input ignored, focus events.
- `floatingButton.test.tsx` — render visibility, click + Enter activation, ARIA label.
- `cloud-mode-banner.test.tsx` — local renders nothing, cloud renders persistently.
- `storage.test.ts` — newest-first ordering, preview truncation.
- `sync-prompts.test.ts` — all four prompt files mirror from mcp-translation.

## Adding a new site

1. Create `entrypoints/<site>.content.ts` (top level — WXT does not recurse). Mirror an existing per-site script. Pick a channel from the enum in `src/lib/types.ts` (or use `"generic"`).
2. Add the site origin to `host_permissions` in `wxt.config.ts`.
3. Add a row to the table above.
4. Add a changeset entry.
5. The extension uses one mutation observer per page (in `selectionWatcher.ts`); you do not need to wire SPA detection yourself.

## Prompt sync

The four prompt templates live in `packages/mcp-translation/src/neurodock_mcp_translation/prompts/` as the canonical source. `scripts/sync-prompts.ts` copies them into `src/lib/prompts/` and `public/prompts/` before every WXT build. The copies are `.gitignore`d so there is no drift between the two surfaces. When the upstream prompts change, the extension picks them up on next build.

## Accessibility notes

- The popup uses Atkinson Hyperlegible (body), Lexend (headings), JetBrains Mono (code) with system-font fallbacks. Webfonts are never loaded from a remote CDN.
- The popup defaults to reduced motion via a `*` rule in `styles.css`. The `prefers-reduced-motion` media query is honoured.
- Every interactive control has an ARIA label and is keyboard navigable.
- Shadow DOM isolation prevents host-site CSS from overriding our focus rings.

## License

AGPL-3.0-or-later. See [LICENSE](../../LICENSE).
