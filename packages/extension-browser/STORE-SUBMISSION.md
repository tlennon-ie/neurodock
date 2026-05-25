# Store submission — @neurodock/extension-browser v0.0.24

Master checklist for submitting v0.0.24 to the Chrome Web Store, Firefox
Add-ons (AMO), and Microsoft Edge Add-ons. This file is the single page
to keep open while submitting. Detailed per-store copy and per-permission
justifications live in [`store-listings/`](./store-listings/). The
listing-copy file in [`store/`](./store/) is the v0.0.24-specific
rewrite tuned for the proactive-guardrails release.

The expected wall-clock time is **about 90 minutes** to submit all three
once artefacts and screenshots are ready, plus the per-store review wait.

---

## Status snapshot — 2026-05-25

| Artefact / requirement              | Path                                                               | Status      | Notes                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| Chrome MV3 zip                      | `.output/neurodockextension-browser-0.0.24-chrome.zip`             | READY       | 3.12 MB, built clean                                                                       |
| Edge MV3 zip                        | `.output/neurodockextension-browser-0.0.24-edge.zip`               | READY       | Binary-compatible with Chrome zip; Edge accepts either                                     |
| Firefox MV3 zip                     | `.output/neurodockextension-browser-0.0.24-firefox.zip`            | READY       | 3.12 MB                                                                                    |
| AMO source bundle                   | `.output/neurodockextension-browser-0.0.24-sources.zip`            | READY       | 0.41 MB; produced by `wxt zip -b firefox`                                                  |
| Listing copy (v0.0.24)              | [`store/listing-copy.md`](./store/listing-copy.md)                 | READY       | Rewritten for end-users; includes proactive-guardrails feature                             |
| Per-permission justifications       | [`store/listing-copy.md`](./store/listing-copy.md) (§ Permissions) | READY       | Pulled from `wxt.config.ts`                                                                |
| Detailed per-store copy             | [`store-listings/`](./store-listings/)                             | READY       | Chrome, Firefox, Edge each have their own file with reviewer notes                         |
| Privacy policy (repo root)          | [`PRIVACY.md`](../../PRIVACY.md)                                   | READY       | Public GitHub blob URL accepted by all three stores                                        |
| Privacy policy (extension-specific) | [`PRIVACY.md`](./PRIVACY.md)                                       | READY       | More detailed surface for the extension trust boundary                                     |
| Screenshots                         | (to be captured)                                                   | NEEDS HUMAN | See [`store/screenshots-needed.md`](./store/screenshots-needed.md). 5 shots × 1280×800 PNG |
| Promo tiles (PNG)                   | rasterise from `store-listings/assets/*.svg`                       | NEEDS HUMAN | 440×280 required; 1400×560 and 920×680 optional but recommended                            |
| Edge logo (300×300 PNG)             | rasterise from `store-listings/assets/icon-128.svg`                | NEEDS HUMAN | Edge-specific size                                                                         |
| Chrome developer account ($5 fee)   | external                                                           | NEEDS HUMAN | One-time, blocking                                                                         |
| Microsoft Partner Center account    | external                                                           | NEEDS HUMAN | Free, blocking                                                                             |
| AMO developer account               | external                                                           | NEEDS HUMAN | Free                                                                                       |

**No engineering blockers.** Every code-side prerequisite is met; what is
left is screenshot capture, asset rasterisation, and the submission itself.

---

## Suggested submission order

1. **Chrome Web Store first.** Review is the fastest (1–3 business days
   for small extensions). Anything the Chrome reviewer flags is
   usually also a problem for the other two stores; better to find out
   sooner.
2. **Microsoft Edge Add-ons second.** The Chrome zip is binary-compatible
   with Edge so most of the work is paste-into-a-different-form. Edge
   review takes 5–7 business days.
3. **Firefox Add-ons (AMO) last.** AMO requires a source bundle and may
   trigger manual review on first submission; can take hours or up to
   a week. Saving it for last means the listing copy is already battle-
   tested by the Chrome reviewer.

---

## First-time submission — step by step

### Chrome Web Store

Console: https://chrome.google.com/webstore/devconsole

1. Pay the **one-time $5 USD developer registration fee** (if not already
   a registered developer).
2. **Create a new item.** Upload
   `.output/neurodockextension-browser-0.0.24-chrome.zip`.
3. **Store listing tab:**
   - **Item title:** copy from [`store/listing-copy.md`](./store/listing-copy.md) § Item title.
   - **Summary (short description):** copy from § Short description (use the primary variant).
   - **Detailed description:** paste from § Detailed description.
   - **Category:** Productivity.
   - **Language:** English (United States).
4. **Graphic assets tab:**
   - Upload 5 screenshots in numerical order
     (see [`store/screenshots-needed.md`](./store/screenshots-needed.md)).
   - Upload `promo-tile-440x280.png` (required).
   - Optionally upload `promo-tile-1400x560.png` (marquee, recommended).
5. **Privacy practices tab:**
   - **Single purpose:** copy from [`store-listings/chrome-web-store.md`](./store-listings/chrome-web-store.md) § Single purpose.
   - **Permissions justification:** one-sentence per permission from
     [`store/listing-copy.md`](./store/listing-copy.md) § Permission justifications.
   - **Host permissions justification:** one-sentence per host from the same table.
   - **Remote code:** select **No**. Paste rationale from § Remote code.
   - **Privacy policy URL:** `https://github.com/tlennon-ie/neurodock/blob/main/PRIVACY.md`.
   - **Data usage disclosures:** tick as in
     [`store-listings/chrome-web-store.md`](./store-listings/chrome-web-store.md) § Data usage.
   - Tick all three **data usage certifications** — they all hold.
6. **Maturity:** Not Mature.
7. **Reviewer notes:** paste the block from
   [`store-listings/chrome-web-store.md`](./store-listings/chrome-web-store.md) § Reviewer notes.
8. Save draft. **Submit for review.**

### Microsoft Edge Add-ons

Console: https://partner.microsoft.com/dashboard/microsoftedge

1. Sign in / create the free Microsoft Partner Center account. Fill the
   publisher profile if first time.
2. **Create new extension.** Upload
   `.output/neurodockextension-browser-0.0.24-edge.zip` (or the chrome
   zip — both work; the Edge zip is preferred for traceability).
3. **Properties:**
   - **Display name:** copy from [`store-listings/edge-addons.md`](./store-listings/edge-addons.md) § Display name.
   - **Category:** Productivity.
4. **Store listing — English (United States):**
   - **Short description, long description:** from
     [`store-listings/edge-addons.md`](./store-listings/edge-addons.md).
   - Upload **300 × 300 store logo** (rasterised from `icon-128.svg`).
   - Upload **1400 × 560 tile image** (same as Chrome marquee).
   - Upload the same 5 screenshots used for Chrome.
   - **Search terms:** 7 terms from
     [`store-listings/edge-addons.md`](./store-listings/edge-addons.md) § Search terms.
5. **Properties → Permissions:** paste each justification (Edge wants
   them in a single field).
6. **Availability:**
   - Markets: All markets.
   - Visibility: Public.
   - Pricing: Free.
7. **Age rating (IARC questionnaire):** answer using
   [`store-listings/content-rating-answers.md`](./store-listings/content-rating-answers.md).
8. **Notes for certification:** paste from
   [`store-listings/edge-addons.md`](./store-listings/edge-addons.md) § Notes for certification.
9. Save. **Submit for certification.**

### Firefox Add-ons (AMO)

Console: https://addons.mozilla.org/developers/

1. Sign in / create the free AMO account.
2. **Submit a new add-on.** Upload
   `.output/neurodockextension-browser-0.0.24-firefox.zip`.
3. When AMO prompts for source code, upload
   `.output/neurodockextension-browser-0.0.24-sources.zip` (already
   produced by `pnpm zip`).
4. **Describe your add-on:**
   - **Name:** `NeuroDock — Translate`.
   - **Summary:** from [`store-listings/firefox-addons.md`](./store-listings/firefox-addons.md) § Summary.
   - **Description:** paste from § Description.
   - **Default locale:** English (US).
   - **Categories:** Productivity, Other.
   - **Tags:** 7 tags from § Tags.
5. **Add-on details:**
   - **Support email:** maintainer address (NOT a personal address).
   - **Support website:** `https://github.com/tlennon-ie/neurodock/issues`.
   - **Privacy policy URL:** `https://github.com/tlennon-ie/neurodock/blob/main/PRIVACY.md`.
   - **Licence:** GNU Affero General Public License v3.0 or later.
6. **Notes to reviewer:** paste from
   [`store-listings/firefox-addons.md`](./store-listings/firefox-addons.md) § Notes to reviewer.
7. Mark **appropriate for all ages**.
8. **Submit for review.**

---

## After submission

Each store will email you with a review-status update. Keep an eye on:

- Chrome: in-dashboard reviewer messages (not always emailed).
- Edge: Partner Center notifications.
- AMO: addons-amo email thread.

Common kickbacks and the first move for each are documented in
[`store-listings/submission-checklist.md`](./store-listings/submission-checklist.md)
§ "If something goes wrong".

Once each listing is live, capture the IDs in
[`store-listings/submission-checklist.md`](./store-listings/submission-checklist.md)
Phase 7 and open a docs PR to add install buttons.
