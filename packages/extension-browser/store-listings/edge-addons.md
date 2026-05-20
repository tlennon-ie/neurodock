# Microsoft Edge Add-ons listing — NeuroDock

This file is the source of truth for the Microsoft Edge Add-ons listing.
Submission console: Microsoft Partner Center →
`https://partner.microsoft.com/dashboard/microsoftedge`.

Edge re-uses the Chromium MV3 package and re-uses the screenshots from
Chrome, so most of this listing is identical to
[`chrome-web-store.md`](./chrome-web-store.md). This file only restates
fields where Edge's form differs.

---

## Package

Upload the **`.output/chrome-mv3.zip`** artefact, not the Firefox build.
WXT produces an Edge-specific build via `pnpm build:edge` that adds
Edge-flavoured manifest extras, but for first submission the Chrome zip is
accepted by Edge and reduces the number of artefacts the user has to
juggle. Switch to the Edge zip once an Edge-specific feature ships.

---

## Listing fields

### Display name

> **NeuroDock — Translate workplace messages**

Edge has a 50-character display-name limit. 43 characters here. Stripped
the "for ND professionals" tail from the Chrome title to fit; the audience
framing is preserved in the description.

### Short description

Edge's short-description field is 200 characters.

> **Decode corporate subtext and check your tone before you send. Built for neurodivergent professionals. Local-first by default; cloud only with your explicit consent.**

168 characters.

### Long description

Re-use the same body as [`chrome-web-store.md`](./chrome-web-store.md) →
**Detailed description**. Edge accepts markdown.

### Category

Edge's category list is slightly different from Chrome's.

> **Productivity** → sub-category **Office & business**

If "Office & business" is not exposed for this account, fall back to
**Productivity → Other**. Do not pick **Accessibility** — Edge's
Accessibility category is mostly populated with screen readers and
high-contrast themes, and this extension would be poorly placed there.

### Supported languages

> **English (United States)**.

Same i18n note as Chrome — see `ROADMAP.md` → "Later — Q4 2026 and
beyond" for the broader plan.

### Age rating

Edge runs every listing through the IARC age-rating questionnaire.

> **PEGI 3 / ESRB Everyone / IARC 3+**.

The answers for the questionnaire itself are in
[`content-rating-answers.md`](./content-rating-answers.md).

If the Edge reviewer pushes back and asks for a 12+ rating on the grounds
that the extension processes free-form text from the user (which is a
common kickback for productivity tools that touch user-generated content),
agree to **12+** rather than arguing. The actual user base is adults
regardless of the formal rating.

---

## Privacy

### Privacy policy URL

> **`https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md`**

Edge requires the URL to be publicly reachable HTML. The GitHub blob URL
qualifies.

### "Does your extension use a Software Development Kit (SDK)?"

> **No.**

(Edge means a third-party analytics or tracking SDK; we use none.)

### "Does your extension collect any personal data?"

> **No.**

Same reasoning as in [`chrome-web-store.md`](./chrome-web-store.md) →
**Privacy disclosures**. The extension does not collect personal data;
when the user enables cloud mode, the user — not the extension — sends the
selected text to the provider the user configured.

### "Does your extension include or call any tracking code?"

> **No.**

---

## Use of permissions

Edge's Partner Center has a dedicated "Use of permissions" page. Fill it
with the same field-by-field justifications used for Chrome.

| Permission       | Justification                                                                                                              |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`      | Read the user's selection or focused composer in the active tab when the user invokes the translate action.                |
| `storage`        | Persist profile, preferences, and (opt-in) a 256-char local history preview in `chrome.storage.local` on this device only. |
| `contextMenus`   | Add a single right-click entry: "NeuroDock: translate selection".                                                          |
| `scripting`      | Re-inject per-site content scripts after SPA navigations on the seven supported sites.                                     |
| `notifications`  | Surface non-blocking status and error notices.                                                                             |
| Host permissions | One per supported work-communication site — Gmail, Slack web, Linear, Notion, GitHub, Google Docs, Outlook web (3 hosts).  |
| Optional hosts   | `http://localhost/*`, `http://127.0.0.1/*` — only requested at runtime when the user enables local-provider mode.          |

Edge sometimes asks for a longer per-host narrative than Chrome. If the
form takes a paragraph, paste the same narrative used in
[`chrome-web-store.md`](./chrome-web-store.md) → **Host permissions
justification** without trimming it.

---

## Promo and screenshots

### Store logo

Edge requires a **300 × 300** PNG store logo. Rasterise
[`assets/icon-128.svg`](./assets/icon-128.svg) at 300 × 300 with no
padding, or commission a final logo to the same visual language.

### Tile image

Edge requires one **promotional tile** at **1400 × 560**. Re-use
[`assets/promo-tile-1400x560.svg`](./assets/promo-tile-1400x560.svg)
rasterised to PNG.

### Screenshots

Edge accepts 1280 × 800 (the Chrome standard) and re-uses them well.
Upload the same five screenshots as Chrome — see
[`screenshots-spec.md`](./screenshots-spec.md). Edge requires at least
one and recommends three.

---

## Audience and discovery

### Markets

> **All markets** — distribute worldwide.

The extension has no jurisdiction-specific code, no payment, no
geo-restricted content. Selecting "All markets" is correct.

### Search terms

Edge's keyword field accepts up to 7 terms. Use:

- `neurodivergent`
- `adhd`
- `autism`
- `accessibility`
- `productivity`
- `translation`
- `local-first`

### Pricing

> **Free**.

The extension is free, AGPL-licensed, and has no in-product purchase
surface.

---

## Notes for certification team

Paste this into the "Notes for certification" field at submission time.

```text
Hi — thanks for reviewing NeuroDock.

This is an AGPL-3.0 translator for workplace messages, built for
neurodivergent professionals. Source:
https://github.com/tlennon-ie/neurodock. The listing package is
packages/extension-browser/.

The submitted ZIP is the Chromium MV3 build (.output/chrome-mv3.zip),
which is binary-compatible with Edge. No Edge-specific features in
v0.0.2.

Key certification points:

1. Single purpose: translate workplace messages on a closed list of
   seven work-communication sites. No <all_urls>. Optional localhost
   permission is requested at runtime only when the user enables a
   local LLM provider.

2. Default install makes zero network calls. No analytics, no
   telemetry, no remote logging.

3. No remote code execution. LLM provider responses are rendered as
   text only (no eval, no innerHTML on provider output).

4. API keys are stored in chrome.storage.local on the user's device.
   The extension transmits them only to the provider URL the user
   configured, never to NeuroDock — NeuroDock has no server.

5. Cloud mode shows a persistent, non-dismissable banner in the popup
   and in every in-page panel.

Full privacy policy:
https://github.com/tlennon-ie/neurodock/blob/main/packages/extension-browser/PRIVACY.md

Please feel free to flag anything — I would rather rebuild than wait.
```
