# Store listing copy — v0.0.24

The end-user-facing copy for the Chrome Web Store, Microsoft Edge
Add-ons, and Firefox Add-ons listings. Detailed per-store form mapping
(reviewer notes, data-usage disclosures, IARC answers) lives in
[`../store-listings/`](../store-listings/). This file is the single
end-user-facing rewrite for v0.0.24, tuned to surface the proactive
guardrails and reader preferences shipped after v0.0.2.

Voice: direct, non-clinical, no diagnosis-gated language, no marketing
intensifiers, no emoji. Matches the [`MANIFESTO.md`](../../MANIFESTO.md).

---

## Item title

> **NeuroDock — Translate**

19 characters. Matches the manifest `name`. Inside the Chrome Web Store
75-character soft cap (the longer marketing phrase lives in the short
description). The Firefox Add-ons "name" field uses this verbatim.

Chrome-specific extended title (Chrome reviewers prefer the audience to
be in the title for single-purpose review):

> **NeuroDock — Translate workplace messages for ND professionals**

73 characters.

---

## Short description — 3 variants

Ranked. Use the primary unless the dashboard rejects it on length.

### Primary (130 chars — Chrome cap 132)

> **Decode corporate subtext and check your tone before you send. Local-first by default; cloud only with your explicit consent.**

Mirrors the manifest `description`. Already field-tested.

### Variant 2 (131 chars)

> **Read the subtext under work messages and check how a draft will land. Runs locally by default; cloud is opt-in with your key.**

Slightly warmer; trades the word "decode" for "read the subtext". Use
if the primary feels too cold for the audience.

### Variant 3 (128 chars)

> **A translator for workplace communication, built for neurodivergent professionals. Local by default; cloud only with consent.**

Foregrounds the audience. Use only if the Chrome reviewer pushes back
on the single-purpose claim of the primary and explicit framing helps.

---

## Detailed description

Paste into Chrome's **Description** field, Edge's **Long description**
field, and AMO's **Description** field. Markdown is accepted on all
three.

```markdown
NeuroDock is a translator for work communication, built for
neurodivergent professionals — ADHD, autistic, AuDHD, OCD, dyslexic,
and every combination. It works on the sites you already use, on the
text you select, on demand. It does not change your messages without
asking.

## Why it helps

- "I stopped re-reading the same Slack message ten times trying to
  figure out if my manager was annoyed."
- "I check the tone of every important reply before I hit send. It
  saved me from at least three apologies last month."
- "It runs on my laptop. None of my work email goes through anyone
  else's server."

(These are illustrative, not real user quotes — written to show the
kinds of jobs the extension is good at.)

## What it does

Four actions, on demand, on text you select or compose:

1. **Translate incoming** — surfaces the literal subtext under a vague
   Slack message or a polite-sounding email, anchored to specific spans
   of the original so you can see exactly what triggered each read.
2. **Check tone** — reads back a draft you are about to send and tells
   you how it will land, with concrete suggestions when the read is off.
3. **Rewrite outgoing** — rewrites a draft toward a target register
   (concise, warm, direct, formal) without sanding off your voice.
4. **Brief meeting** — turns a wall of meeting notes into a short brief
   you can actually use the next morning.

## Where it runs

Gmail, Slack web, Linear, Notion, GitHub, Google Docs, and Outlook on
the web (consumer, corporate, and Office 365). That is the entire site
list. The manifest does not request `<all_urls>` and never will. Each
host is per-site, declared up front, and reviewable in the install
prompt.

## How to invoke it

- Select text and right-click — pick "NeuroDock: translate selection".
- Or open the popup and paste a draft into the composer.
- Or use the floating button that appears in the supported message
  composers.

Results land in an in-page panel beside the original text. Nothing is
auto-applied to your draft — every change is yours to accept or reject.

## Proactive guardrails (new in v0.0.24)

Three lightweight checks the extension runs before it asks any LLM to
do work for you:

- **Hyperfocus check** — if you are deep into the same surface for an
  unusually long stretch, the extension notices and offers a break,
  rather than feeding the loop.
- **Rumination check** — if you are translating roughly the same
  message for the fourth or fifth time, the extension says so and
  suggests stepping away.
- **Sycophancy check** — runs on outgoing rewrites; flags drafts where
  the suggested rewrite would erase too much of your original meaning
  or voice.

All three are advisory, not blocking. You can disable them per check
in Settings. The defaults are tuned conservatively.

## Reader preferences (new in v0.0.24)

Pick how the translator addresses you and how it presents reads:

- **Audience framing** — neurotype-aware, neutral-professional, or
  silent.
- **Detail level** — terse one-liner, normal, or expanded.
- **Output language** — separate from your interface language, in case
  you read in one language and write in another.

These tune the prompt; they do not change the underlying surfaces.

## Local-first means local-first

On install, the extension makes zero network calls. There is no
analytics SDK, no error reporter, no telemetry, no remote logging, no
crash reporting, no fingerprinting. Out of the box it runs in mock
mode and returns clearly-labelled placeholder responses so you can
see the surfaces without sending any data anywhere.

When you want actual translations, you choose a provider:

- **LM Studio or Ollama (local).** The extension talks to a local
  server on your own machine (or a Tailscale node, or any host you
  grant permission to). Nothing leaves your device.
- **Anthropic, OpenAI, or OpenRouter (cloud).** The extension calls
  that provider's API directly from your browser, signed with your own
  API key. NeuroDock has no server in the middle and never sees the
  traffic.

Whenever cloud mode is on, the extension shows a persistent banner in
the popup and in every in-page panel. The banner cannot be dismissed
without switching back to local or mock mode. You should always know
when your text is leaving your machine.

## What is stored, and where

- A small profile (your mode, your preferences, your reader settings)
  in `chrome.storage.local` on this device.
- Your API key, if you set one, in `chrome.storage.local` on this
  device.
- Optionally, a local history of recent translations in an
  extension-scoped IndexedDB database — off by default and capped to a
  256-character preview per entry. No remote sync exists.

That is the complete list. There is no NeuroDock account, no sign-in,
no cloud sync. Uninstalling the extension deletes all of it.

The full privacy policy is at
https://github.com/tlennon-ie/neurodock/blob/main/PRIVACY.md and the
extension-specific surface at
https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md.

## What it is not

NeuroDock is software. It is not therapy, not a medical device, not a
diagnostic tool, and not a substitute for clinical care or proper
workplace accommodations. It does not treat or remediate any
condition. The guardrail layer is documented in `ETHICS.md` in the
repository.

## Open source

NeuroDock is AGPL-3.0-or-later. Source, manifesto, and contributing
guide:

- Repository: https://github.com/tlennon-ie/neurodock
- Manifesto: https://github.com/tlennon-ie/neurodock/blob/main/MANIFESTO.md
- Ethics: https://github.com/tlennon-ie/neurodock/blob/main/ETHICS.md
- Issues: https://github.com/tlennon-ie/neurodock/issues
```

Word count: ~720 words. Within all three stores' caps (Chrome 16,000
chars, Edge 10,000 chars, AMO no hard cap).

---

## Permission justifications

Chrome requires one justification per permission AND one per host
permission. Edge and AMO accept the same text in their single
combined "Permissions" field.

### Required permissions (from `wxt.config.ts` `permissions`)

| Permission      | Justification                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`     | Read the user's current text selection or focused message-composer field in the active tab when the user invokes the translate action. No background reads of any other tab.                                                                |
| `storage`       | Persist the user's profile, provider settings, reader preferences, and (if the user opts in) a 256-character local history preview, using `chrome.storage.local` on this device only.                                                       |
| `contextMenus`  | Add a single right-click entry ("NeuroDock: translate selection") so the user can invoke translation without leaving the keyboard or the page.                                                                                              |
| `scripting`     | Re-inject the per-site content script after in-page (SPA) navigations on Gmail, Slack, Linear, Notion, GitHub, Google Docs, and Outlook web. Without it, the floating Translate button disappears after the first client-side route change. |
| `notifications` | Show non-blocking error and status notices (for example, "translation request failed: provider unreachable") instead of swallowing failures silently.                                                                                       |

### Required host permissions (from `wxt.config.ts` `host_permissions`)

| Host pattern                      | Justification                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `https://mail.google.com/*`       | Inject the floating Translate button into Gmail message composers and read user-selected text in Gmail threads.        |
| `https://app.slack.com/*`         | Inject the floating Translate button into Slack web message composers and read user-selected text in channels and DMs. |
| `https://linear.app/*`            | Inject the floating Translate button into Linear issue and comment composers.                                          |
| `https://www.notion.so/*`         | Inject the floating Translate button into Notion page editors and inline comments.                                     |
| `https://*.notion.so/*`           | Same as above, for Notion workspace subdomains (the canonical workspace URL pattern).                                  |
| `https://*.notion.site/*`         | Same as above, for Notion's public-site subdomain pattern.                                                             |
| `https://github.com/*`            | Inject the floating Translate button into GitHub issue, PR, and comment composers.                                     |
| `https://docs.google.com/*`       | Inject the floating Translate button into Google Docs document and comment editors.                                    |
| `https://outlook.live.com/*`      | Inject the floating Translate button into Outlook web (consumer) message composers.                                    |
| `https://outlook.office.com/*`    | Inject the floating Translate button into Outlook web (corporate) message composers.                                   |
| `https://outlook.office365.com/*` | Inject the floating Translate button into Outlook web (Office 365) message composers.                                  |

### Optional host permissions (requested at runtime, with user consent)

These are listed in the manifest but not granted at install time. Each
is requested via `chrome.permissions.request()` only when the user takes
a specific action that requires it. Document in the "Notes to reviewer"
field; do not list in the main per-host table.

| Optional host pattern         | When requested                                                                                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http://localhost/*`          | When the user enables a localhost-bound local LLM (Ollama, LM Studio) in Settings.                                                                                                                                          |
| `http://127.0.0.1/*`          | Same as above, for users whose local server binds the loopback IP rather than the name.                                                                                                                                     |
| `http://*/*`                  | When the user types a non-localhost local LLM base URL in Settings (e.g. a Tailscale node or LAN box). Requested per-host at runtime; CSP further restricts to the LM Studio (`:1234`) and Ollama (`:11434`) default ports. |
| `https://*/*`                 | When the user right-clicks an image on an HTTPS site and selects "Describe image". Requested per-host at runtime, on a user gesture.                                                                                        |
| `https://api.anthropic.com/*` | When the user enters and saves an Anthropic API key.                                                                                                                                                                        |
| `https://api.openai.com/*`    | When the user enters and saves an OpenAI API key.                                                                                                                                                                           |
| `https://openrouter.ai/*`     | When the user enters and saves an OpenRouter API key.                                                                                                                                                                       |

---

## Remote code

> **No.** The extension does not load, execute, or interpret remote
> code.

LLM provider responses are treated strictly as **data**. The extension
renders them as text inside a result panel. It does not `eval()` them,
does not pass them to `Function()`, does not inject them as HTML
without sanitisation, and does not write them to the DOM via
`innerHTML`. The signed bundle the store reviews is the complete code
that ever runs. There is no remote bootstrap, no dynamic script
loading, no fetch-and-execute.

---

## Privacy policy URL

> `https://github.com/tlennon-ie/neurodock/blob/main/PRIVACY.md`

Backup URL (if the reviewer asks for the extension-specific surface):

> `https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md`

Both are publicly readable on GitHub and acceptable to all three stores.

---

## Single purpose (Chrome only)

> Translate workplace communication into and out of neurotypical norms
> for neurodivergent users, on a fixed list of work-communication sites.

Do not broaden this to mention guardrails or history. Those belong in
the detailed description.

---

## Search terms / tags

Use for Edge "Search terms" (7) and AMO "Tags" (max 10).

1. translator
2. neurodivergent
3. accessibility
4. communication
5. productivity
6. tone
7. workplace

Optional 8th–10th for AMO if room: `local-first`, `ADHD`, `autism`.

---

## Reviewer notes (paste once per store)

```text
Thank you for reviewing NeuroDock.

This is an open-source AGPL-3.0 translator for work communication.
Source: https://github.com/tlennon-ie/neurodock. This listing is
`packages/extension-browser/` in that repo, version 0.0.24.

Key reviewer points:

1. Single purpose: translate workplace messages on a fixed, closed
   list of work-communication sites (Gmail, Slack web, Linear, Notion,
   GitHub, Google Docs, Outlook web). No <all_urls>. No dynamic host
   permissions added at runtime except the optional set described in
   the manifest, each requested with a user gesture and a Chrome
   permission prompt.

2. Local-first: the default install makes zero network calls. No
   analytics, no telemetry, no error reporting, no remote logging.
   Mock mode returns clearly-labelled placeholder responses so users
   can see the surfaces without sending data anywhere.

3. Remote code: none. LLM responses are rendered as text only. The
   extension does not eval, does not load remote scripts, does not
   use innerHTML on provider output.

4. API keys: stored only in chrome.storage.local on the user's device.
   The extension transmits them only to the provider URL the user
   configured, never to NeuroDock (NeuroDock has no server).

5. Cloud-mode banner: when on, a persistent banner appears in the
   popup and in every in-page panel. Cannot be dismissed without
   switching back to local or mock mode.

6. Proactive guardrails (new in 0.0.24): three local advisory checks
   (hyperfocus, rumination, sycophancy) that run before the LLM
   request. All advisory, all overridable, all off-switch in Settings.
   No data leaves the device for these checks.

Privacy policy: https://github.com/tlennon-ie/neurodock/blob/main/PRIVACY.md
Extension-specific: https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md

If you need clarification, please open an issue or comment on the
listing — maintainers monitor both.
```
