# Privacy policy — NeuroDock browser extension

**Last reviewed:** 2026-06-20
**Applies to:** `@neurodock/extension-browser` v0.1.2 and later, on Chrome,
Microsoft Edge, and Mozilla Firefox.
**Source of truth for this policy:** this file, in the NeuroDock monorepo at
[`packages/extension-browser/PRIVACY.md`](./PRIVACY.md). If a store listing
ever says something different, this file wins.

This policy is written in plain English. We try to keep legal hedging out of
the way of the actual claims, because the people we build for read a lot of
opaque consent prose every day and we will not add to that pile.

---

## TL;DR

- The default install makes **zero network calls**. No analytics, no
  telemetry, no remote logging, no crash reporting.
- The extension stores its profile, preferences, and (if you opt in) a short
  local history **only inside your browser**, using `chrome.storage.local`
  and an extension-scoped IndexedDB database. Nothing in that data ever
  leaves your machine on its own.
- If you turn cloud mode on, the only network traffic the extension makes is
  the request you triggered, going directly to the LLM provider **you chose
  and configured with your own API key**. NeuroDock has no server in the
  middle and never sees that traffic.
- There is no NeuroDock account. There is no sign-in. There is no "user".
  There is just your browser and the providers you authorise.

---

## Data collection, handling, storage & sharing (at a glance)

For store reviewers and anyone who wants the four required answers in one place.
None of these four sections is omitted; each is expanded in §3 below.

- **Collection.** The extension collects **no personal data for NeuroDock**. It
  reads only the specific text you select or type when you trigger a translation,
  plus which supported site you are on. There is no account, no identifier, no
  analytics, and no telemetry.
- **Handling.** That text is used solely to produce the translation you asked
  for, at the moment you ask for it. It is processed by the model endpoint **you**
  configure — mock by default, a local server, or a cloud provider with your own
  API key — and is used for nothing else.
- **Storage.** Your profile, preferences, optional API key, and optional local
  history are stored **only on your device** (`chrome.storage.local` plus an
  extension-scoped IndexedDB). NeuroDock operates no server and stores nothing.
- **Sharing.** Nothing is shared with NeuroDock or any third party by the
  extension. In cloud mode your request goes directly from your browser to the
  provider you chose, governed by that provider's policy. Nothing is sold or
  shared — there is no collected data to sell or share.

---

## 1. Who runs this thing

NeuroDock is a community-run open-source project under the AGPL-3.0-or-later
licence. The browser extension is one package inside the monorepo at
[github.com/tlennon-ie/neurodock](https://github.com/tlennon-ie/neurodock).

There is no NeuroDock Inc. There is no NeuroDock LLC. There is no NeuroDock
SaaS. The maintainers operate as individuals; questions and security reports
go through [`SECURITY.md`](../../SECURITY.md) in the repo.

For data-protection purposes, **you are your own data controller** when you
use this extension. The extension is a tool that runs entirely inside your
browser; the project does not process your data on your behalf because the
project does not have a server.

---

## 2. What the extension does

The extension adds two surfaces to a fixed list of work-communication sites:

1. A small floating "Translate" button that appears near message
   composers and selected text on supported sites.
2. A right-click context-menu entry, `NeuroDock: translate selection`.

When you trigger either surface, the extension runs one of four translation
tools (`translate_incoming`, `check_tone`, `rewrite_outgoing`,
`brief_meeting`) against the text you selected or typed. The result appears
in a small panel inside the page.

The full list of supported sites is in the extension's README. It is **a
closed list**; the manifest does not request `<all_urls>`.

---

## 3. What data exists, where it lives, and where it goes

### 3.1 Data the extension stores on your device

All of the following lives on your device only. None of it is transmitted
anywhere by the extension itself.

| What                        | Where                  | Default state        |
| --------------------------- | ---------------------- | -------------------- |
| Profile (mode, preferences) | `chrome.storage.local` | Created on first run |
| Cloud-mode flag             | `chrome.storage.local` | `false`              |
| Provider id / model id      | `chrome.storage.local` | Empty                |
| API key (when you set one)  | `chrome.storage.local` | Empty                |
| Local history (opt-in)      | Extension IndexedDB    | **Off**              |

The local history database, when you enable it, stores metadata plus a
preview truncated to 256 characters per entry. It has no remote sync and no
export-on-schedule. You can clear it at any time from the popup, or by
uninstalling the extension.

### 3.2 Data the extension reads from the page

When you trigger a translation, the extension reads the **specific text you
selected, or the contents of the composer you are typing in**, plus a small
context envelope (which site channel you are on — for example `gmail` or
`slack` — so the prompt can be tuned). It does not read your inbox, your
DMs, your documents, or anything you did not explicitly hand it.

### 3.3 Data sent to LLM providers (only if you opt in)

The default install runs in **mock mode**. In mock mode, the extension
returns a clearly labelled placeholder response and makes no network call.

If you enable a local provider (such as Ollama on your own machine), the
request goes to `http://localhost` on your device.

If you enable a cloud provider (OpenRouter, Anthropic, OpenAI, or any other
provider supported in a later release), the request goes **directly from
your browser to that provider's API endpoint**, signed with the API key you
entered. NeuroDock does not proxy that request, does not log it, and does
not see it. The provider's own privacy policy governs what they do with
that traffic; you should read it before enabling cloud mode.

When cloud mode is on, the extension shows a persistent banner in the popup
and in every in-page panel. The banner cannot be dismissed without
switching back to local or mock mode. This is deliberate.

### 3.4 Data sent to NeuroDock servers

None. There are no NeuroDock servers.

---

## 4. Permissions, in plain English

The extension requests the following from the browser. Each is the minimum
needed for the corresponding feature.

| Permission                | Why                                                                                                                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`               | Read the selection or focused composer in the tab you are using.                                                                                      |
| `storage`                 | Save your profile and preferences on this device.                                                                                                     |
| `contextMenus`            | Add the right-click "translate selection" entry.                                                                                                      |
| `scripting`               | Re-inject our content script after in-page (SPA) navigations.                                                                                         |
| `notifications`           | Show non-blocking error or status notices (e.g. "request failed").                                                                                    |
| Host permissions          | Listed per site — Gmail, Slack web, Linear, Notion, GitHub, Google Docs, Outlook web. Closed list, no `<all_urls>`.                                   |
| Optional host permissions | `http://localhost/*` and `http://127.0.0.1/*` for local LLM servers like Ollama. Requested only when you enable local mode with a localhost provider. |

---

## 5. What we do not do

- No analytics SDK, no Google Analytics, no PostHog, no Plausible, no
  Sentry, no Bugsnag, no error reporter of any kind.
- No fingerprinting. The extension does not read canvas, WebGL, audio,
  hardware concurrency, or any other browser-fingerprint signal.
- No advertising, no ad networks, no affiliate trackers.
- No third-party content scripts injected on your behalf.
- No remote code execution. The extension does not load JavaScript from a
  remote server at runtime; everything that runs is in the signed bundle
  reviewed by the store.
- No selling of data. There is no data to sell.
- No sharing with third parties. We have no third parties.

---

## 6. Children

The extension is a general-audience tool but is designed for neurodivergent
adults navigating workplace communication. We do not knowingly market it to
or design for children under 13, and we do not collect any data, so there
is no "data about children" to discuss.

---

## 7. Region-specific notes

### 7.1 European Economic Area, United Kingdom, Switzerland (GDPR/UK GDPR)

- **Legal basis for processing:** consent. You consent by installing the
  extension and, separately, by enabling cloud mode if you choose to.
- **Data controller:** you. The extension stores everything on your device;
  the project has no server to process anything on your behalf.
- **International transfers:** none initiated by the project. If you enable
  a cloud provider, that provider may transfer data internationally per
  their own policy; read theirs.
- **Right to access, rectify, erase, restrict, port, object:** you control
  every byte the extension stores. Open the popup, clear what you want, or
  uninstall the extension. There is no NeuroDock-side copy to request.

### 7.2 California (CCPA / CPRA)

- **Categories of personal information collected:** none collected by
  NeuroDock. You may enter an API key, which is personal-adjacent
  credentials material; it is stored on your device only.
- **Sale or sharing of personal information:** none. We have nothing to
  sell and no one to share with.
- **Right to delete:** uninstall the extension or clear extension storage
  from your browser settings.

### 7.3 Other jurisdictions

Local-only processing on the user's own device, with no transmission
initiated by the extension, generally puts NeuroDock outside the scope of
most data-protection regimes targeted at controllers and processors. Where
it does not, the rights described above apply by default because the data
never leaves the user's control in the first place.

---

## 8. Security

- API keys you enter are stored in `chrome.storage.local`. That storage is
  scoped to the extension and is not accessible to web pages. It is **not**
  encrypted at rest beyond whatever the browser provides; treat your
  device's account as the security boundary.
- The extension does not load remote code, does not execute strings as
  code, and does not use `eval`.
- The release artefact is built with WXT and ships with sourcemaps so
  reviewers and users can read what is actually running.
- Vulnerability reports go through [`SECURITY.md`](../../SECURITY.md).

---

## 9. Changes to this policy

When this policy changes, we update the **Last reviewed** date at the top
and note the change in `packages/extension-browser/CHANGELOG.md`. Material
changes (anything that broadens what data is collected or where it goes)
will be called out in the changelog explicitly, not buried.

---

## 10. Contact

- Repository: https://github.com/tlennon-ie/neurodock
- Issues: https://github.com/tlennon-ie/neurodock/issues
- Security: see [`SECURITY.md`](../../SECURITY.md) in the repo.

There is no support email associated with a company because there is no
company. Maintainers respond on GitHub.
