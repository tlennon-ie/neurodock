# Screenshots specification — NeuroDock browser extension

This document is the shot list the human submitter follows when capturing
the five screenshots required by the three store listings. The same five
screenshots cover all three stores — Chrome accepts 1280 × 800, Edge
accepts the Chrome dimensions, and AMO accepts up to 2400 × 1800.

Capture all five at **1280 × 800 PNG** unless a specific shot below says
otherwise.

---

## Setup before capturing

Do this once, before taking any of the shots. It saves a lot of re-takes.

1. **Build and load the production extension.**
   - `pnpm --filter @neurodock/extension-browser build:chrome`.
   - Load `.output/chrome-mv3/` as an unpacked extension in a clean
     Chrome profile (Settings → Extensions → Developer mode → Load
     unpacked). Capture on Chrome even for the Firefox listing —
     consistency across the three listings matters more than per-browser
     authenticity.
2. **Use a clean browser window.**
   - Disable every other extension.
   - Sign out of any personal Google / Slack / Notion accounts; sign
     into the fixtures listed under "Fixtures" below.
   - Hide bookmarks bar (`Ctrl+Shift+B`).
   - Use the default Chrome theme (no dark mode, no Material You theme).
3. **Use the OS-level capture tool with windowed-mode framing.**
   - **No Windows taskbar in the shot.** Resize the browser window so
     the bottom is above the taskbar, then capture the window region only.
   - **No notification toasts.** Toggle Focus Assist / Do Not Disturb on
     for the duration of capture.
   - **No personal data visible in the URL bar.** Sign-in fixtures only.
4. **Match the visual language.**
   - The popup uses Atkinson Hyperlegible (body), Lexend (headings),
     JetBrains Mono (code). System fallbacks render the same wordmark.
   - Single neutral accent (`#5a6a8f` — see `docs/public/og-image.svg`).
   - No gradients in the chrome around the screenshot. No mock data
     watermarks. No "screenshot" overlays.

---

## Fixtures (safe to screenshot)

These are deliberately mundane and safe to publish.

- **Gmail fixture** — `ndtest.shotruns@gmail.com`, with one inbound
  email from `manager.gmail.fixture@gmail.com` titled "checking in on the
  Q3 thing" containing the body:
  > _"Hey, when you get a sec can you ping me on where we're landing
  > with the Q3 thing? No rush but would be good to align before
  > Thursday."_
- **Slack fixture** — a private workspace `nd-shot-runs.slack.com` with
  one channel `#general` and one message from `@avery`:
  > _"Quick one — does the new flow handle the edge case from last
  > week? Not blocking, just curious."_
- **Notion fixture** — a single page titled "Q3 planning notes" with
  three bullet points of placeholder text.
- **No real human names, no real company names, no real customer data.**

If a fixture cannot be assembled in time, mock the page in a local
HTML file styled to resemble the real surface. Mark the screenshot
filename with `-mock` so reviewers can identify it on request.

---

## Shot list

All five shots are required. Number the exported files
`01-popup-home.png`, `02-popup-settings.png`, etc.

---

### Shot 1 — Popup home, mock mode

| Field      | Value                                                           |
| ---------- | --------------------------------------------------------------- |
| Resolution | 1280 × 800                                                      |
| File name  | `01-popup-home.png`                                             |
| Caption    | "Local-first by default. Mock mode shown — zero network calls." |

**Capture:**

1. Click the NeuroDock toolbar icon on `about:blank`.
2. Wait for the popup to render. Confirm the mode toggle says **Mock**.
3. Capture the **entire browser window** showing the open popup,
   trimmed to 1280 × 800.

**Show:**

- The popup with the NeuroDock wordmark, the Mock mode pill, and the
  four tool entrypoints (`translate_incoming`, `check_tone`,
  `rewrite_outgoing`, `brief_meeting`).
- The toolbar icon, highlighted.

**Hide:**

- Any other extension icons.
- Browser profile avatar.

---

### Shot 2 — Popup settings, OpenRouter + auto-router selected

| Field      | Value                                                              |
| ---------- | ------------------------------------------------------------------ |
| Resolution | 1280 × 800                                                         |
| File name  | `02-popup-settings.png`                                            |
| Caption    | "Cloud mode is opt-in. Pick a provider; your key stays on device." |

**Capture:**

1. Open the popup, switch to the **Settings** tab.
2. Toggle **Cloud mode** on.
3. Pick **OpenRouter** as the provider.
4. Pick **auto-router** as the model (this is the EXT-LLM branch's
   default — confirm spelling against the merged PR before capturing).
5. Paste a masked placeholder key: `sk-or-v1-••••••••••••••••••••` (use
   that exact glyph string, not a real key).
6. Capture the popup with the persistent cloud-mode banner visible at
   the top.

**Show:**

- Provider dropdown showing **OpenRouter**.
- Model dropdown showing **auto-router**.
- The masked key field.
- The persistent cloud-mode banner.

**Hide:**

- Any real API key. Mask via UI; do not blur in post.

---

### Shot 3 — Floating "Translate" button on a Gmail message

| Field      | Value                                                     |
| ---------- | --------------------------------------------------------- |
| Resolution | 1280 × 800                                                |
| File name  | `03-gmail-floating-button.png`                            |
| Caption    | "One floating button, on the sites you actually work on." |

**Capture:**

1. Sign into the Gmail fixture.
2. Open the inbound email from `manager.gmail.fixture@gmail.com`
   titled "checking in on the Q3 thing".
3. Wait for the NeuroDock floating button to appear near the message
   body. Hover so the tooltip shows: "Translate incoming".
4. Capture the full message pane.

**Show:**

- The Gmail message thread (subject line visible).
- The floating button with the hover tooltip.
- The NeuroDock toolbar icon to confirm provenance.

**Hide:**

- The Gmail account avatar.
- The left-rail label list (collapse it: keyboard shortcut `Ctrl+\`).
- Any other open tabs.

---

### Shot 4 — Translation result panel below a Slack message

| Field      | Value                                                    |
| ---------- | -------------------------------------------------------- |
| Resolution | 1280 × 800                                               |
| File name  | `04-slack-result-panel.png`                              |
| Caption    | "Plain-English read of what the message actually means." |

**Capture:**

1. Sign into the Slack fixture, open `#general`.
2. Hover the message from `@avery`. Click the NeuroDock floating
   button.
3. Wait for the result panel to render under the message. The panel
   should show the literal subtext beneath the original message.
4. Capture the channel view with the result panel fully expanded.

**Show:**

- The Slack message at the top.
- The NeuroDock result panel below, with a clear visual divider.
- The cloud-mode banner inside the panel (since we are in cloud mode
  for this shot — keep the EXT-LLM defaults from shot 2 active).

**Hide:**

- Real workspace name in the URL bar (the fixture workspace is fine).
- The Slack sidebar's recent DMs (collapse the sidebar if possible).

---

### Shot 5 — Right-click context-menu action in Notion

| Field      | Value                                                          |
| ---------- | -------------------------------------------------------------- |
| Resolution | 1280 × 800                                                     |
| File name  | `05-notion-context-menu.png`                                   |
| Caption    | "Right-click anywhere on the supported sites. No new windows." |

**Capture:**

1. Open the Notion fixture page "Q3 planning notes".
2. Select one of the bullet points (a short phrase, not the whole
   page).
3. Right-click. The browser context menu should show the
   **NeuroDock: translate selection** entry.
4. Capture the page with the context menu open and the entry hovered.

**Show:**

- The Notion page with the selection visible.
- The browser context menu with the NeuroDock entry hovered.

**Hide:**

- Any "Last edited by" attribution that shows a name.
- The Notion sidebar (collapse it).

---

## Per-store upload notes

| Store  | Accepted dimensions     | Min / max count | Order matters?                                                                          |
| ------ | ----------------------- | --------------- | --------------------------------------------------------------------------------------- |
| Chrome | 1280 × 800 or 640 × 400 | 1 – 5 required  | Yes — first screenshot is the listing hero. Upload shot 1 first.                        |
| Edge   | 1280 × 800              | 1 – 10 allowed  | Yes — first slot is the hero image on the listing page.                                 |
| AMO    | up to 2400 × 1800       | up to 10        | No — AMO randomises, but the first uploaded is the social preview. Upload shot 1 first. |

Upload all five in numerical order to every store. Do not skip shot 5
even though it is optional on Chrome — the right-click flow is a real
differentiator and reviewers like seeing it.

---

## Post-capture checklist

Before submitting any of the listings, verify each PNG against this list:

- [ ] Exact 1280 × 800 (or whatever the shot says).
- [ ] No Windows taskbar visible.
- [ ] No notification toasts.
- [ ] No personal data (email addresses, real names, real workspace
      slugs, real API keys).
- [ ] The cloud-mode banner is visible in every screenshot where cloud
      mode is on (shots 2 and 4).
- [ ] The NeuroDock toolbar icon is visible and recognisable in every
      shot.
- [ ] PNG, sRGB, < 1 MB each. JPEG only if Chrome rejects the PNG (it
      shouldn't).
- [ ] File names match the numbered convention above.
