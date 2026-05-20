# Chrome Web Store listing — NeuroDock

This file is the source of truth for the Chrome Web Store listing. Copy each
field into the corresponding box in the Chrome Web Store Developer Dashboard
(`https://chrome.google.com/webstore/devconsole`) at submission time.

If any of these fields conflict with a later edit made directly in the
dashboard, update this file. The dashboard is authoritative once published,
but this file is the working copy and should always reflect the live
listing.

---

## Item title

> **NeuroDock — Translate workplace messages for ND professionals**

- 73 characters, within Chrome's **75-character** limit.
- Includes the product name, the verb (`Translate`), and the audience
  (`ND professionals`). The reviewer needs to see the single-purpose claim
  reflected here; "Translate workplace messages" satisfies that.

## Summary

> **Decode corporate subtext and check your tone before you send. Local-first by default; cloud only with your consent.**

- 130 characters, within Chrome's **132-character** limit.
- Mirrors the manifest `description` field for consistency.

## Category

> **Productivity**

**Justification (do not paste into the form — this is reviewer-facing
reasoning to keep on hand):** the extension's primary use case is reducing
the time a neurodivergent professional spends decoding inbound work
messages and second-guessing outbound ones. That is productivity work. An
alternative was Accessibility, which is a better thematic match but has
substantially lower discoverability; we accept the trade-off and lean on
the description copy to make the accessibility framing clear.

## Language

> **English (United States)** for v0.0.2.

Internationalisation of both the CLI and the extension is on the public
roadmap (`ROADMAP.md` → "Later — Q4 2026 and beyond"). Until that lands,
the listing is English-only across all three stores.

---

## Detailed description

Paste this into the **Description** field. Chrome allows markdown; the
following is well within the 16,000-character cap.

```markdown
NeuroDock is a translator for work communication, built by and for
neurodivergent professionals — ADHD, autistic, AuDHD, OCD, dyslexic, and
every combination.

It does four things, on demand, on text you select or compose:

1. **Translate incoming** — surfaces the literal subtext under a vague
   Slack message or a polite-sounding email, so you do not have to spend
   the next forty minutes wondering what your colleague actually meant.
2. **Check tone** — reads back a draft you are about to send and tells you
   how it will land, with concrete suggestions if the read is off.
3. **Rewrite outgoing** — rewrites a draft toward a target register
   (concise, warm, direct, formal) without sanding off your voice.
4. **Brief meeting** — turns a wall of meeting notes into a short brief
   you can actually use.

It runs on Gmail, Slack web, Linear, Notion, GitHub, Google Docs, and
Outlook on the web. That is the entire site list. The manifest does not
request `<all_urls>` and never will.

## Built around five principles

NeuroDock is open-source under AGPL-3.0-or-later and the codebase is
governed by a public manifesto:

- **Lower friction**, for users and for contributors.
- **Local-first by default; cloud is opt-in.**
- **The user is the authority** on their own neurotype.
- **Composable over monolithic** — small swappable pieces.
- **Refuse where appropriate** — clinical guardrails that fire when an
  LLM would otherwise amplify rumination, hyperfocus, or anxiety.

The extension implements those principles in concrete code, not in
copy.

## Local-first means local-first

On install, the extension makes **zero network calls**. There is no
analytics SDK, no error reporter, no telemetry, no remote logging, no
crash reporting, no fingerprinting, no ads. Out of the box it runs in
mock mode and returns clearly-labelled placeholder responses so you can
see the surfaces without sending any data anywhere.

When you want actual translations, you choose a provider:

- **Ollama (local).** The extension talks to `http://localhost` on your
  own machine. Nothing leaves your device.
- **OpenRouter, Anthropic, OpenAI** (or any cloud provider added in a
  future release). The extension calls that provider's API **directly
  from your browser, using your API key**. NeuroDock has no server in
  the middle and never sees the traffic.

Whenever cloud mode is on, the extension shows a persistent banner in
the popup and inside every in-page panel. The banner cannot be
dismissed without switching back to local or mock mode. This is
deliberate; you should always know when your text is leaving your
machine.

## What is stored, and where

- A small profile (your mode, your preferences) in `chrome.storage.local`
  on this device.
- Your API key, if you set one, in `chrome.storage.local` on this device.
- Optionally, a local history of recent translations in an
  extension-scoped IndexedDB database, off by default and capped to a
  256-character preview per entry. No remote sync exists.

That is the complete list. There is no NeuroDock account, no sign-in,
no cloud sync. The full privacy policy is in the repository at
`packages/extension-browser/PRIVACY.md`.

## What it is not

NeuroDock is software. It is not therapy, not a medical device, not a
diagnostic tool, and not a substitute for clinical care or for proper
workplace accommodations. We never describe a feature as treating,
curing, or remediating any condition. The clinical guardrail layer is
documented in `ETHICS.md` in the repository.

## For contributors

The extension is one package in a larger monorepo. If you want to add
a site, change a prompt, or improve the popup UI, every on-ramp is in
`CONTRIBUTING.md`. Pull requests welcome.

## Links

- Source: https://github.com/tlennon-ie/neurodock
- Manifesto: https://github.com/tlennon-ie/neurodock/blob/main/MANIFESTO.md
- Ethics: https://github.com/tlennon-ie/neurodock/blob/main/ETHICS.md
- Privacy: https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md
- Issues: https://github.com/tlennon-ie/neurodock/issues
- Licence: AGPL-3.0-or-later
```

---

## Single purpose

Chrome requires every Manifest V3 extension to state a single purpose. This
field is reviewed strictly; broadening it past one concrete user job is the
most common reason for rejection.

> **Translate workplace communication into and out of neurotypical norms for neurodivergent users, on a fixed list of work sites.**

Do **not** broaden this to mention guardrails, history, or the broader
NeuroDock substrate. Those belong in the description.

---

## Permissions justification

Chrome reviewers read these field-by-field. Each justification must be one
sentence focused on the one feature that needs the permission. Vague
justifications get kicked back.

| Permission      | Justification text to paste                                                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`     | Read the user's current text selection or focused message-composer field in the active tab when the user invokes the translate action.                        |
| `storage`       | Persist the user's profile, preferences, and (if the user opts in) a 256-character local history preview, using `chrome.storage.local` on this device only.   |
| `contextMenus`  | Add a single right-click context-menu entry ("NeuroDock: translate selection") so the user can invoke translation without leaving the keyboard or the page.   |
| `scripting`     | Re-inject the per-site content script after in-page (SPA) navigations on Gmail, Slack, Linear, Notion, GitHub, Google Docs, and Outlook web.                  |
| `notifications` | Show non-blocking error and status notices (for example, "translation request failed: provider unreachable") instead of throwing silent failures at the user. |

---

## Host permissions justification

Each entry in `host_permissions` requires its own one-sentence justification
on the dashboard's "Host permissions" page.

| Host pattern                      | Justification text                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `https://mail.google.com/*`       | Inject the floating "Translate" button into Gmail message composers and read user-selected text in Gmail threads. |
| `https://app.slack.com/*`         | Inject the floating "Translate" button into Slack web message composers and read user-selected text in channels.  |
| `https://linear.app/*`            | Inject the floating "Translate" button into Linear issue and comment composers.                                   |
| `https://www.notion.so/*`         | Inject the floating "Translate" button into Notion page editors and inline comments.                              |
| `https://github.com/*`            | Inject the floating "Translate" button into GitHub issue, PR, and comment composers.                              |
| `https://docs.google.com/*`       | Inject the floating "Translate" button into Google Docs document and comment editors.                             |
| `https://outlook.live.com/*`      | Inject the floating "Translate" button into Outlook web (consumer) message composers.                             |
| `https://outlook.office.com/*`    | Inject the floating "Translate" button into Outlook web (corporate) message composers.                            |
| `https://outlook.office365.com/*` | Inject the floating "Translate" button into Outlook web (Office 365) message composers.                           |

### Optional host permissions

Listed in the manifest but not requested until the user opts into local
provider mode. Document them in the "Permissions justification" notes
field but do not list them in the main host-permissions table.

| Optional host pattern | Justification text                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------- |
| `http://localhost/*`  | Reach a local LLM server (such as Ollama) when the user explicitly enables local mode.      |
| `http://127.0.0.1/*`  | Same as above, for users whose local LLM server binds the loopback IP rather than the name. |

---

## Remote code

> **No.** The extension does not load, execute, or interpret remote code.

LLM provider responses are treated strictly as **data**. The extension
renders them as text inside a result panel. It does not `eval` them, does
not pass them to `Function`, does not inject them as HTML without
sanitisation, and does not write them to the DOM via `innerHTML`.

The signed bundle that the store reviews is the complete code that ever
runs. There is no remote bootstrap, no dynamic script loading, no service
worker that fetches additional scripts.

---

## Privacy disclosures

Chrome's "Privacy practices" section requires per-category disclosures.
Answer each as follows.

### Single purpose disclosure (free-text)

> The extension's single purpose is to help neurodivergent professionals
> decode the subtext of work messages they receive, and check the tone of
> messages they are about to send, on a fixed list of work-communication
> sites. It runs entirely on the user's device by default.

### Permissions justifications

See the table above. Paste each justification into the corresponding row in
the dashboard.

### Data usage disclosures

For each category Chrome lists, tick or untick as follows. **"Yes" means
the extension itself collects or transmits the category.** A category that
the user manually sends to their chosen provider does not count, by Chrome's
own definition — the user is the actor, not the extension.

| Category                            | Collected?                                                                                                                                                                                      | Notes                                                                                                                                                                                                         |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personally identifiable information | **No**                                                                                                                                                                                          | The extension never asks for or stores PII. There is no account.                                                                                                                                              |
| Health information                  | **No**                                                                                                                                                                                          | Self-identification of neurotype lives in the local profile only; not transmitted.                                                                                                                            |
| Financial and payment information   | **No**                                                                                                                                                                                          | The extension takes no payments.                                                                                                                                                                              |
| Authentication information          | **No** for NeuroDock; user-supplied LLM API keys are stored locally in `chrome.storage.local` and never transmitted by the extension to anyone other than the provider URL the user configured. |
| Personal communications             | **No**                                                                                                                                                                                          | The text the user explicitly selects to translate is sent to the user's chosen LLM provider only when the user clicks translate, and only in cloud mode. The extension does not aggregate, log, or retain it. |
| Location                            | **No**                                                                                                                                                                                          | The extension does not read location signals.                                                                                                                                                                 |
| Web history                         | **No**                                                                                                                                                                                          | The extension does not read browsing history.                                                                                                                                                                 |
| User activity                       | **No**                                                                                                                                                                                          | The extension does not track clicks, key sequences, or scroll behaviour.                                                                                                                                      |
| Website content                     | **Yes — limited**                                                                                                                                                                               | The extension reads only the user-selected text or the contents of the message composer the user invokes it on. It does not crawl, scrape, or read other parts of the page.                                   |

### Data usage certifications

Tick **Yes** for every certification in this block. They all hold:

- **I do not sell or transfer user data to third parties** outside the
  approved use cases. _(There are no approved use cases. The extension does
  not sell or transfer any data.)_
- **I do not use or transfer user data for purposes unrelated to my
  item's single purpose.** _(Confirmed.)_
- **I do not use or transfer user data to determine creditworthiness or
  for lending purposes.** _(Confirmed.)_

### Privacy policy URL

> **`https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md`**

If a `neurodock.dev/privacy/extension` URL exists at submission time, use
that instead. Either is acceptable to Chrome as long as the URL serves
publicly readable HTML.

---

## Promo tiles

Chrome supports three promo-tile sizes. The marquee tile is optional but
recommended for surfaces like "Editor's picks" and the homepage.

| Tile               | Dimensions | Required?              | Source                                                               |
| ------------------ | ---------- | ---------------------- | -------------------------------------------------------------------- |
| Small promo tile   | 440 × 280  | Required for promotion | [`assets/promo-tile-440x280.svg`](./assets/promo-tile-440x280.svg)   |
| Marquee promo tile | 1400 × 560 | Optional, recommended  | [`assets/promo-tile-1400x560.svg`](./assets/promo-tile-1400x560.svg) |
| Medium promo tile  | 920 × 680  | Optional               | [`assets/promo-tile-920x680.svg`](./assets/promo-tile-920x680.svg)   |

The files in `assets/` are SVG placeholders that match the same visual
language as `docs/public/og-image.svg` — single neutral accent (#5a6a8f),
system-font fallbacks, no gradients, no photography. Rasterise to PNG at
the exact target size before upload; Chrome accepts JPEG and PNG, not SVG.

## Icon

Chrome reads the 128 × 128 icon from the extension's `public/icon/128.png`
at build time. If that file is missing, use
[`assets/icon-128.svg`](./assets/icon-128.svg) as the source and rasterise.

## Screenshots

See [`screenshots-spec.md`](./screenshots-spec.md). Chrome accepts 1280×800
or 640×400; use 1280×800. Upload all five in the order listed in the spec.

---

## Reviewer notes (optional field)

Paste this into the "Notes to reviewer" field. Reviewers do read it for
extensions that touch as many host permissions as this one.

```text
Thank you for reviewing NeuroDock.

This extension is an open-source AGPL-3.0 translator for work
communication. The source lives at
https://github.com/tlennon-ie/neurodock and the package this listing
represents is `packages/extension-browser/`.

Key reviewer points:

1. Single purpose: translate workplace messages on a fixed, narrow list
   of seven work-communication sites. No <all_urls>. No dynamic host
   permissions added at runtime except the optional localhost pair,
   which is requested only when the user explicitly enables local-mode
   with a localhost provider.

2. Local-first: the default install makes zero network calls. There is
   no analytics, no telemetry, no error reporting, no remote logging.

3. Remote code: none. LLM provider responses are rendered as text only.
   The extension does not eval, does not load remote scripts, and does
   not use innerHTML on provider output.

4. API keys: stored only in chrome.storage.local on the user's device.
   The extension transmits them only to the provider URL the user
   configured, never to NeuroDock (NeuroDock has no server).

5. Cloud mode: when on, the extension renders a persistent banner in
   the popup and in every in-page panel. Cannot be dismissed without
   switching back to local or mock mode.

Full privacy policy:
https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md

If you need any clarification, please open an issue or comment on the
listing — the maintainers monitor both.
```
