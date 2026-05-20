# Store listings — NeuroDock browser extension

This directory contains everything needed to submit `@neurodock/extension-browser`
to the three browser stores we target: **Chrome Web Store**, **Microsoft Edge
Add-ons**, and **Firefox Add-ons (AMO)**.

It is intentionally store-agnostic at the top level: each store has its own
markdown file with the listing copy, permission justifications, content-rating
answers, and reviewer notes that store requires.

Nothing in this directory is consumed by the build. These files exist for a
human submitter to copy-paste into each store's developer console.

---

## Order of operations

This is the order the human submitter should follow. The sequence matters
because Chrome has the shortest review window and the strictest "single
purpose" enforcement; if Chrome rejects, the other two listings should be
revised before submission, not after.

1. **Pre-flight** — confirmed by the engineering side, not the submitter:
   - The `EXT-LLM` PR has merged. OpenRouter, Ollama, Anthropic, and OpenAI
     are wired in `src/lib/translation-client.ts`.
   - `package.json` `version` is `0.0.2` (or later), `private` has been
     removed or set to `false`, and the build emits three signed zips under
     `.output/<target>-mv3.zip`.
   - `PRIVACY.md` is published at a stable URL (the GitHub blob URL in the
     repo is fine; see [PRIVACY.md](../PRIVACY.md)).
   - All five screenshots from [`screenshots-spec.md`](./screenshots-spec.md)
     have been captured at the listed resolutions.
2. **Chrome Web Store** — see [`chrome-web-store.md`](./chrome-web-store.md).
   Expected review window: 1–3 business days for a first-time small extension
   with limited host permissions. Can be longer if the reviewer flags any of
   the host_permissions for justification.
3. **Microsoft Edge Add-ons** — see [`edge-addons.md`](./edge-addons.md).
   Re-uses the Chrome zip and Chrome screenshots. Expected review window: 5–7
   business days. Microsoft Partner Center is slower but more forgiving on
   the single-purpose rule than Chrome.
4. **Firefox Add-ons (AMO)** — see [`firefox-addons.md`](./firefox-addons.md).
   Uses the Firefox-specific zip. Expected review window: hours for an
   auto-approved release, up to 1–7 days if manual review is triggered (it
   probably will be for a first submission). AMO requires a source bundle
   on first submission; see the file for instructions.

After all three are live, link them from the docs site
(`docs/src/content/docs/install.md`) and the root README.

---

## What is prepared here vs. what is manual

### Prepared in this directory

| File                                                       | What it gives the submitter                                                                                       |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [`chrome-web-store.md`](./chrome-web-store.md)             | Title, summary, description, category, single-purpose statement, every permission justification, privacy answers. |
| [`edge-addons.md`](./edge-addons.md)                       | The Microsoft Partner Center equivalents, including age rating.                                                   |
| [`firefox-addons.md`](./firefox-addons.md)                 | AMO listing, source-bundle instructions, support email placeholder, licence answer.                               |
| [`screenshots-spec.md`](./screenshots-spec.md)             | Per-shot test-fixture instructions, resolutions, what to crop, what to avoid.                                     |
| [`content-rating-answers.md`](./content-rating-answers.md) | Answers to every store's content-rating questionnaire.                                                            |
| [`submission-checklist.md`](./submission-checklist.md)     | The step-by-step checklist the human submitter actually executes.                                                 |
| [`assets/`](./assets/)                                     | SVG placeholders for the Chrome promo tiles and the 128px icon.                                                   |
| [`../PRIVACY.md`](../PRIVACY.md)                           | The privacy policy each listing links to.                                                                         |

### Manual steps (a human must do them)

These cannot be automated and are out of scope for this directory.

1. **Create paid developer accounts.**
   - Chrome Web Store: one-time **$5 USD** registration to publish.
   - Microsoft Partner Center (Edge Add-ons): **free**, individual account.
   - Mozilla AMO: **free**.
2. **Take the five live screenshots** described in
   [`screenshots-spec.md`](./screenshots-spec.md). They must be captured
   against the production build of v0.0.2 with the EXT-LLM features visible,
   not against the v0.0.1 mock surface.
3. **Generate or commission final promo-tile artwork.** The SVGs in
   `assets/` are placeholders that establish the visual language (single
   neutral accent, system-font fallbacks, no gradients). Replace or refine
   before submission; rasterise to PNG at the dimensions each store needs.
4. **Decide the long-term home for `PRIVACY.md`.** A GitHub raw URL is fine
   for v0.0.2 but a `neurodock.dev/privacy/extension` page would be cleaner.
   Update the link in each store listing accordingly.
5. **Submit through each store's web console.** The store dev consoles do
   not have public APIs for first-time submissions; everything is web-form.

---

## How to update these files

When the extension changes in a way that affects what the store sees —
new permissions, new host permissions, new providers, new surface area —
update the relevant section in **every** store-listing file in this
directory. The three listings drift if you only edit one.

When the privacy posture changes, update [`../PRIVACY.md`](../PRIVACY.md)
and the three "Privacy" sections in the listings, and bump the
**Last reviewed** date in `PRIVACY.md`.

---

## Decisions flagged for human review

These choices in the listing copy and submission flow are judgement calls
that the submitter should explicitly confirm or change before pushing:

- **Category:** Productivity on all three stores. An alternative is
  "Accessibility" on Chrome, which has lower traffic but better match. The
  current listings argue for Productivity.
- **Single-purpose phrasing** (Chrome): "Translate workplace
  communication into and out of neurotypical norms for neurodivergent
  users." This is deliberately narrow to satisfy Chrome's single-purpose
  rule. Do not broaden it to mention guardrails, history, or the broader
  NeuroDock substrate — those belong in the description, not the
  single-purpose statement.
- **Age rating** (Edge / Microsoft IARC): **PEGI 3 / ESRB Everyone /
  IARC 3+**. Justified in `content-rating-answers.md`. Edge sometimes
  prefers 12+ for productivity tools that accept arbitrary user input; if
  the reviewer kicks back, switch to 12+ rather than arguing.
- **OpenRouter as the default cloud provider in screenshots.** Assumed
  based on the EXT-LLM brief. If EXT-LLM lands with a different default,
  adjust [`screenshots-spec.md`](./screenshots-spec.md) shot 2 accordingly.
- **License** dropdown on AMO: **GNU Affero General Public License v3.0
  or later**. This matches the repo `LICENSE` and the package `license`
  field. AMO requires this match; do not pick a different option.
