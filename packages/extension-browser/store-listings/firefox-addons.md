# Firefox Add-ons (AMO) listing — NeuroDock

This file is the source of truth for the Mozilla Add-ons (AMO) listing.
Submission console: `https://addons.mozilla.org/developers/`.

AMO's form fields differ in name and length from Chrome's. The mapping
below uses AMO's terminology.

---

## Add-on name

> **NeuroDock — Translate**

- AMO has a soft 50-character recommendation on the add-on name. 19
  characters here.
- The longer marketing phrase lives in **Summary** below, where it has more
  room.

## Summary

AMO's Summary field is 250 characters.

> **A translator for workplace messages, built for neurodivergent professionals. Decode corporate subtext and check your tone before you send. Local-first by default; cloud only with your explicit consent.**

210 characters.

## Description

AMO accepts markdown. Use the same body as the Chrome description, since
it already passes AMO's content guidelines.

```markdown
NeuroDock is a translator for work communication, built by and for
neurodivergent professionals — ADHD, autistic, AuDHD, OCD, dyslexic, and
every combination.

It does four things, on demand, on text you select or compose:

1. **Translate incoming** — surfaces the literal subtext under a vague
   Slack message or a polite-sounding email, so you do not have to spend
   the next forty minutes wondering what your colleague actually meant.
2. **Check tone** — reads back a draft you are about to send and tells
   you how it will land, with concrete suggestions if the read is off.
3. **Rewrite outgoing** — rewrites a draft toward a target register
   (concise, warm, direct, formal) without sanding off your voice.
4. **Brief meeting** — turns a wall of meeting notes into a short brief
   you can actually use.

It runs on Gmail, Slack web, Linear, Notion, GitHub, Google Docs, and
Outlook on the web. That is the entire site list. The manifest does not
request `<all_urls>` and never will.

## Local-first

On install the extension makes **zero network calls**. No analytics, no
telemetry, no remote logging, no crash reporting, no ads, no
fingerprinting. Out of the box it runs in mock mode and returns
clearly-labelled placeholder responses so you can see the surfaces
without sending any data anywhere.

When you want real translations, you choose a provider:

- **Ollama (local)** — the extension talks to `http://localhost` on
  your own machine. Nothing leaves your device.
- **OpenRouter, Anthropic, OpenAI** — the extension calls the
  provider's API **directly from your browser, using your API key**.
  NeuroDock has no server in the middle and never sees the traffic.

When cloud mode is on, the extension shows a persistent banner in the
popup and inside every in-page panel. It cannot be dismissed without
switching back to local or mock mode.

## What is stored, and where

- A small profile in `browser.storage.local` on this device.
- Your API key, if you set one, in `browser.storage.local` on this
  device.
- Optionally, a local history of recent translations in an
  extension-scoped IndexedDB database, off by default and capped to a
  256-character preview per entry. No remote sync exists.

The full privacy policy is at
https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md.

## What it is not

NeuroDock is software. It is not therapy, not a medical device, not a
diagnostic tool, and not a substitute for clinical care or for proper
workplace accommodations.

## Open source

AGPL-3.0-or-later. Source:
https://github.com/tlennon-ie/neurodock. Issues:
https://github.com/tlennon-ie/neurodock/issues.
```

---

## Categories

AMO lets you pick **one primary** and **two secondary** categories per
add-on type.

| Slot      | Pick                                        |
| --------- | ------------------------------------------- |
| Primary   | **Productivity**                            |
| Secondary | **Web Development** (host-page integration) |
| Secondary | **Other**                                   |

AMO does not expose an "Accessibility" category for extensions in the same
way Chrome does; Productivity remains the right fit.

## Tags

AMO accepts up to 10 free-form tags. Use these:

- `neurodivergent`
- `adhd`
- `autism`
- `accessibility`
- `productivity`
- `translation`
- `communication`
- `gmail`
- `slack`
- `local-first`

## Default add-on locale

> **English (US)** — `en-US`.

`ROADMAP.md` lists "i18n of the CLI and extension" in the **Later — Q4
2026 and beyond** bucket. Until that lands, this is the only locale.

---

## Support information

| Field           | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| Support email   | **`<PLACEHOLDER — maintainer to set>`** (e.g. `extension@neurodock.dev`)          |
| Support website | `https://github.com/tlennon-ie/neurodock/issues`                                  |
| Homepage        | `https://neurodock.dev` (or the GitHub repo URL if the docs site is not live yet) |

The support email cannot be left empty on AMO. If no dedicated mailbox is
ready by submission time, point it at the maintainer's project address and
update later. AMO surfaces this email to users on the listing page, so do
not use a personal address.

---

## Privacy policy URL

> **`https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md`**

If a `neurodock.dev/privacy/extension` URL exists at submission time, use
that instead. AMO requires a URL; in-store privacy text is not enough.

## Privacy policy text (for the in-store box, if used)

If you prefer to fill the in-store policy box instead of (or in addition
to) the URL, paste the full [`../PRIVACY.md`](../PRIVACY.md) body. AMO
re-renders it as markdown. Update both surfaces when the policy changes.

---

## License

AMO requires you to pick a licence from a fixed dropdown.

> **GNU Affero General Public License v3.0 or later**

This matches:

- The repo `LICENSE` file.
- The `license` field in `packages/extension-browser/package.json`
  (`AGPL-3.0-or-later`).

Do not pick a different option. AMO compares the dropdown against the
manifest's `homepage_url` and `license` markers, and a mismatch fails
review.

---

## Source code submission

**Firefox is the only one of the three stores that requires the source.**
AMO reviewers need to be able to reproduce the build from clean source
because the extension ships with bundled JavaScript.

### What to upload

A single zip named `firefox-source-bundle.zip` containing:

- The full repository tree as of the tag for this release (e.g. `git archive`).
- A top-level `BUILD.md` describing how to reproduce the submitted XPI.

### Reproducible-build instructions for `BUILD.md`

Paste this into `BUILD.md` at the root of the source bundle:

````markdown
# Reproducing the NeuroDock Firefox build

This source bundle corresponds to release `v0.0.2` of
`@neurodock/extension-browser`.

## Prerequisites

- Node.js `>= 22` (the engines field in `packages/extension-browser/package.json`).
- pnpm `>= 9`.
- A Unix-like shell or PowerShell.

## Reproduce

```sh
pnpm install --frozen-lockfile
pnpm --filter @neurodock/extension-browser build:firefox
pnpm --filter @neurodock/extension-browser zip
```

The output XPI lands at
`packages/extension-browser/.output/firefox-mv3.zip`.

## Notes for reviewers

- The build is non-minified by default — WXT produces readable JavaScript
  with inline sourcemaps (`vite.build.sourcemap = "inline"` in
  `wxt.config.ts`).
- Prompts are synced from `packages/mcp-translation` at build time via
  `scripts/sync-prompts.ts`. The synced files are git-ignored;
  re-running `pnpm build:firefox` regenerates them deterministically
  from the source prompts.
- No remote code is loaded at runtime. No content scripts execute
  strings as code. No `eval`. No remote `<script>` injection.
- The default install makes no network calls; cloud providers are
  opt-in and identified per-request by the user.

## Verifying

After build, the manifest at
`packages/extension-browser/.output/firefox-mv3/manifest.json` should
match the `manifest` block in `wxt.config.ts`, with WXT's standard MV3
post-processing applied (permissions array, `browser_specific_settings`,
etc.).
````

### How to generate the zip

From the repo root:

```sh
git archive --format=zip --output=firefox-source-bundle.zip HEAD
```

Then add `BUILD.md` to it (`zip firefox-source-bundle.zip BUILD.md` after
the fact). Upload via AMO's "Source Code" step in the submission flow.

---

## Bundled / minified code disclosure

AMO reviewers explicitly ask about this. Answer:

> The extension is built with WXT (https://wxt.dev), which uses Vite under
> the hood. The release bundle is **not minified**; `wxt.config.ts` sets
> `vite.build.sourcemap = "inline"` so reviewers can read every line.
> All prompt templates are plain YAML, synced from
> `packages/mcp-translation` at build time by
> `scripts/sync-prompts.ts`. No code is loaded at runtime from any
> remote source.

---

## Notes for AMO reviewer

Paste this into the "Notes for reviewer" field at submission time.

```text
Hi — thanks for reviewing NeuroDock.

This is an AGPL-3.0 translator for workplace messages, built for
neurodivergent professionals. Source:
https://github.com/tlennon-ie/neurodock. Listing package:
packages/extension-browser/.

Build reproducibility:
- See BUILD.md in the attached firefox-source-bundle.zip.
- pnpm install --frozen-lockfile && pnpm --filter @neurodock/extension-browser build:firefox && pnpm --filter @neurodock/extension-browser zip
- Output: packages/extension-browser/.output/firefox-mv3.zip

Security and privacy highlights:
1. Default install makes zero network calls. No analytics, no telemetry.
2. host_permissions is a closed list of seven work sites. No <all_urls>.
3. Optional localhost host permission is only requested at runtime when
   the user enables local-mode with a localhost provider.
4. No remote code. Provider responses are rendered as text only.
5. API keys live in browser.storage.local on the user's device.
6. Cloud mode shows a persistent, non-dismissable banner.
7. Full privacy policy at packages/extension-browser/PRIVACY.md.

Testing:
- Vitest suite: pnpm --filter @neurodock/extension-browser test
- Manual smoke: open Gmail or Slack web in Firefox, select text, use the
  right-click menu "NeuroDock: translate selection". Default mode returns
  a clearly labelled MOCK response and makes no network call.

If anything in the source bundle is unclear, please flag it — I would
rather rebuild than wait.
```

---

## Content rating

AMO does not run a separate IARC questionnaire the way Microsoft does. It
asks one question:

- **Is this add-on appropriate for all ages?** → **Yes.**

The reasoning is in [`content-rating-answers.md`](./content-rating-answers.md).
