# Submission checklist — NeuroDock browser extension

The end-to-end checklist for the human submitter. Work through it in
order. Tick items as you go; do not skip. The total wall-clock time is
about **two focused hours** for the artefact prep, plus the per-store
review wait described at the end.

Stop at the first failed pre-flight check. Do not start any store
submission with a half-built package.

---

## Phase 0 — Pre-flight (engineering blockers)

These must be true **before** you open any store dashboard.

- [ ] **EXT-LLM PR has merged to `main`.** Confirm via `gh pr list
--state merged --search "EXT-LLM"` and skim the diff to verify
      OpenRouter, Ollama, Anthropic, and OpenAI providers are wired in
      `packages/extension-browser/src/lib/translation-client.ts`.
- [ ] **`packages/extension-browser/package.json`** has:
  - `"version": "0.0.2"` (or later).
  - `"private"` removed or set to `false`.
  - `"license": "AGPL-3.0-or-later"` unchanged.
- [ ] **`pnpm --filter @neurodock/extension-browser typecheck`** passes
      with zero errors.
- [ ] **`pnpm --filter @neurodock/extension-browser test`** passes with
      zero failures.
- [ ] **`packages/extension-browser/PRIVACY.md`** is committed and
      reachable at the public GitHub blob URL referenced in every
      listing.
- [ ] **`packages/extension-browser/CHANGELOG.md`** has an entry for
      `0.0.2` describing the LLM wiring and the store submission.
- [ ] The repo has a tag for the release (`git tag v0.0.2 && git push
--tags`). Without a tag, the AMO source bundle is harder to
      reproduce.

---

## Phase 1 — Build the production artefacts

Run from the repo root.

- [ ] `pnpm install --frozen-lockfile`.
- [ ] `pnpm --filter @neurodock/extension-browser build`. This builds
      Chrome, Firefox, and Edge targets in one shot. Output lands in
      `packages/extension-browser/.output/<target>-mv3/`.
- [ ] `pnpm --filter @neurodock/extension-browser zip`. Produces the
      three signed zips: `.output/chrome-mv3.zip`,
      `.output/firefox-mv3.zip`, `.output/edge-mv3.zip`.
- [ ] Inspect `.output/chrome-mv3/manifest.json` — confirm
      permissions match the table in
      [`chrome-web-store.md`](./chrome-web-store.md). No surprises
      from the build pipeline.
- [ ] Load `.output/chrome-mv3/` as an unpacked extension in a clean
      Chrome profile and smoke-test:
  - Popup opens.
  - Mock mode returns a placeholder response.
  - Cloud mode shows the persistent banner.
  - Right-click "NeuroDock: translate selection" appears on each
    supported site.

---

## Phase 2 — Capture screenshots

Follow [`screenshots-spec.md`](./screenshots-spec.md) end to end.

- [ ] All five shots captured at 1280 × 800 PNG.
- [ ] All five run through the post-capture checklist at the bottom
      of that file.
- [ ] Files named `01-popup-home.png` through `05-notion-context-menu.png`.
- [ ] Stored somewhere durable (not Desktop).

---

## Phase 3 — Rasterise assets

The SVG placeholders in [`assets/`](./assets/) need to become PNGs at
the exact target sizes before any store will accept them. Use
ImageMagick, Inkscape, or Figma's export — anything that does not
add a watermark.

- [ ] `promo-tile-440x280.png` (Chrome small promo tile).
- [ ] `promo-tile-920x680.png` (Chrome medium promo tile, optional).
- [ ] `promo-tile-1400x560.png` (Chrome marquee / Edge tile).
- [ ] `icon-128.png` (verify `packages/extension-browser/public/icon/128.png`
      exists from the build; if it does, prefer the build's icon over the
      placeholder SVG).
- [ ] Edge store logo at **300 × 300 PNG** (rasterise from
      `icon-128.svg`).

---

## Phase 4 — Chrome Web Store submission

Console: https://chrome.google.com/webstore/devconsole.

- [ ] Pay the **$5 USD one-time developer registration fee** if not
      already a registered developer. This step blocks publication
      and cannot be skipped.
- [ ] Create new item. Upload `.output/chrome-mv3.zip`.
- [ ] Fill **Item title**, **Summary**, **Category**, **Language**,
      and **Detailed description** from
      [`chrome-web-store.md`](./chrome-web-store.md).
- [ ] Upload screenshots (5 of them, in numerical order).
- [ ] Upload promo tile(s).
- [ ] Fill **Single purpose**, **Permissions justification** (one
      per permission), and **Host permissions justification** (one
      per host).
- [ ] Tick **Remote code: No** and provide the justification block
      from [`chrome-web-store.md`](./chrome-web-store.md).
- [ ] Fill **Privacy practices** section. Set privacy policy URL.
- [ ] Set **Maturity** to **Not Mature**.
- [ ] Paste reviewer notes from [`chrome-web-store.md`](./chrome-web-store.md).
- [ ] Tick the three data-usage certifications.
- [ ] Submit for review.

**Expected timeline:** 1–3 business days for a first-time small
extension. Up to a week if a reviewer requests clarification on the
host permissions — that is the most common kickback for this shape
of extension.

---

## Phase 5 — Microsoft Edge Add-ons submission

Console: https://partner.microsoft.com/dashboard/microsoftedge.

- [ ] Verify the **free** Microsoft Partner Center account is
      created and the publisher profile is filled in.
- [ ] Create new extension. Upload `.output/chrome-mv3.zip` (the
      Chromium zip is binary-compatible with Edge; see
      [`edge-addons.md`](./edge-addons.md) for the rationale).
- [ ] Fill **Display name**, **Short description**, **Long
      description**, **Category** from
      [`edge-addons.md`](./edge-addons.md).
- [ ] Upload **300 × 300 store logo** and **1400 × 560 tile image**.
- [ ] Upload the same five screenshots used for Chrome.
- [ ] Fill **Use of permissions** page.
- [ ] Complete the **IARC age-rating questionnaire** using the
      answers in [`content-rating-answers.md`](./content-rating-answers.md).
- [ ] Set **Markets: All markets**, **Pricing: Free**, **Search
      terms** (7 terms from the listing file).
- [ ] Paste reviewer notes from [`edge-addons.md`](./edge-addons.md).
- [ ] Submit for certification.

**Expected timeline:** 5–7 business days. Edge is slower than Chrome
but more forgiving on single-purpose. The most common kickback is
the IARC rating bump to 12+; accept it rather than arguing.

---

## Phase 6 — Firefox Add-ons (AMO) submission

Console: https://addons.mozilla.org/developers/.

- [ ] Sign into the AMO account (free; create one if needed).
- [ ] Generate the **source bundle**:
      `git archive --format=zip --output=firefox-source-bundle.zip
v0.0.2`, then add `BUILD.md` (text in
      [`firefox-addons.md`](./firefox-addons.md) → **Reproducible-build
      instructions**) to the archive.
- [ ] Submit new add-on. Upload `.output/firefox-mv3.zip`.
- [ ] Upload the source bundle when AMO prompts.
- [ ] Fill **Add-on name**, **Summary**, **Description**,
      **Categories**, **Tags**, **Default locale** from
      [`firefox-addons.md`](./firefox-addons.md).
- [ ] Set **Support email** to the maintainer address (NOT a
      personal address) and **Support website** to the GitHub issues
      URL.
- [ ] Set **Privacy policy URL** to the public blob URL of
      `packages/extension-browser/PRIVACY.md`.
- [ ] Pick **GNU Affero General Public License v3.0 or later** from
      the licence dropdown.
- [ ] Paste reviewer notes from [`firefox-addons.md`](./firefox-addons.md).
- [ ] Mark the add-on as **appropriate for all ages**.
- [ ] Submit for review.

**Expected timeline:** sometimes within hours for auto-approval, up
to 1–7 days if manual review is triggered. First submission of a new
add-on usually triggers manual review.

---

## Phase 7 — Post-submission monitoring

For each store:

- [ ] Subscribe to email notifications from the dashboard.
- [ ] Add the reviewer-correspondence URL to your inbox filter so
      reviewer messages do not get buried.
- [ ] If a reviewer asks for changes, update **this directory** with
      the answer first, then update the store listing. The repo is
      the source of truth; the store is downstream.
- [ ] Once each listing is live, capture:
  - Chrome Web Store ID.
  - Edge Add-ons ID.
  - AMO add-on slug.
- [ ] Open a docs PR adding install buttons for each store to
      `docs/src/content/docs/install.md` and the root `README.md`.

---

## Phase 8 — Post-launch hygiene

- [ ] Tag the release in git: `git tag -a v0.0.2 -m "extension store submission"`.
- [ ] Add a CHANGELOG entry mirrored at
      `packages/extension-browser/CHANGELOG.md` with the three store URLs.
- [ ] Add a release note to the docs site.
- [ ] Add the three store URLs to `package.json` `homepage` or a
      sibling field as appropriate.
- [ ] Set a calendar reminder to re-check `PRIVACY.md`'s **Last
      reviewed** date every six months even if nothing has changed.

---

## If something goes wrong

| Symptom                                                               | Most likely cause                                                                                   | First move                                                                                                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chrome rejects with "single purpose unclear"                          | The description leaned into guardrails or the broader substrate instead of the translation surface. | Trim the description to the translation surface. Move guardrail copy to a "What it is not" paragraph. Resubmit with reviewer notes that point at the change. |
| Chrome rejects with "host permissions broader than necessary"         | The reviewer wants per-host narrative rather than the one-liner.                                    | Re-paste the longer narrative from the table; mention that each host corresponds to one supported site and the list is closed.                               |
| Edge rejects with "age rating insufficient"                           | IARC bumped to 12+ because user-supplied free-form text.                                            | Accept 12+. Update [`content-rating-answers.md`](./content-rating-answers.md) with the new outcome.                                                          |
| AMO rejects with "source bundle does not reproduce the submitted XPI" | Lockfile drift or a `sync-prompts` ordering issue.                                                  | Rebuild from a clean checkout. If the diff is real, fix the build script before re-uploading. Do not submit a bundle that does not match.                    |
| AMO rejects with "minified or obfuscated code without source"         | A dependency ships minified.                                                                        | List the dependency, link to its public source repo, and note in the reviewer message that the rest of the bundle is readable.                               |
