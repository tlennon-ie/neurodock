# Screenshots needed — v0.0.24

Five screenshots cover all three stores. Chrome accepts 1280×800 or
640×400; Edge accepts the Chrome dimensions; AMO accepts up to
2400×1800. Capture all five at **1280 × 800 PNG** for consistency.

Setup and fixtures live in
[`../store-listings/screenshots-spec.md`](../store-listings/screenshots-spec.md).
This file is the shorter, v0.0.24-specific shot list — five frames that
sell the surfaces shipped in 0.0.24 (proactive guardrails, reader
preferences, the LM Studio fix).

Capture on Chrome even for the Firefox / Edge listings; consistency
across the three listings matters more than per-browser authenticity.

---

## Shot 1 — Popup with LM Studio (local) selected

- **Filename:** `01-popup-local-lmstudio.png`
- **Dimensions:** 1280 × 800 PNG
- **What is in the frame:**
  - Extension popup open (click the toolbar action to detach as a window
    so it fills the frame).
  - Provider dropdown set to **LM Studio (local)**.
  - Base URL field showing `http://localhost:1234/v1` (the default).
  - Model field with one selected model (use a small generic local
    model name — `llama-3.1-8b-instruct` reads cleanly).
  - Status row shows **Connected** (the green dot, not the warning dot).
  - The "Cloud mode" banner is **not** visible — because LM Studio is
    local, the banner is correctly hidden.
- **Why it sells:** First frame the reviewer sees. Establishes
  local-first is real, not aspirational. Reviewers familiar with the
  Chrome Web Store will recognise the absence of a cloud-mode warning
  banner as a feature, not a missing element.

---

## Shot 2 — Popup Settings tab with the new Reader Preferences fieldset

- **Filename:** `02-popup-reader-preferences.png`
- **Dimensions:** 1280 × 800 PNG
- **What is in the frame:**
  - Popup open on the **Settings** tab.
  - Scroll position: the **Reader preferences** fieldset is roughly
    centred vertically.
  - Audience framing: **Neurotype-aware** selected.
  - Detail level: **Normal**.
  - Output language: **English (US)**.
  - The fieldset above (Proactive guardrails) partly visible at the top
    of the frame so the reviewer can see both new fieldsets in one
    shot.
- **Why it sells:** Shows the v0.0.24-specific tuning surfaces. Reader
  preferences are the answer to the most common reviewer-feedback line
  on v0.0.2 ("how do I make this less clinical?"). One frame shows the
  user has direct control.

---

## Shot 3 — Right-click context menu on Gmail

- **Filename:** `03-context-menu-gmail.png`
- **Dimensions:** 1280 × 800 PNG
- **What is in the frame:**
  - Gmail open on the safe fixture inbox (see
    [`../store-listings/screenshots-spec.md`](../store-listings/screenshots-spec.md)
    § Fixtures).
  - An inbound message thread visible. A short phrase in the message
    body is selected (highlighted in blue).
  - The browser's right-click context menu is open, **with the
    "NeuroDock: translate selection" item visible and hovered**.
  - The rest of the menu shows the standard Chrome entries (Copy, Search
    Google for…, Inspect) so the entry sits in its expected place.
- **Why it sells:** Demonstrates the primary invocation flow without
  any UI clutter. Reviewers care about how the extension is invoked
  more than what it returns; this shot answers that question
  unambiguously.

---

## Shot 4 — In-page panel showing a translation result

- **Filename:** `04-inpage-panel-translation.png`
- **Dimensions:** 1280 × 800 PNG
- **What is in the frame:**
  - Same Gmail thread as Shot 3.
  - The in-page result panel docked to the right edge of the content
    area.
  - Panel header: "Translate incoming".
  - Panel body shows:
    - **Literal subtext** — 2–3 ranked reads, each anchored to a span
      of the original (hover state shows the highlight on the page).
    - **Ambiguity spans** — at least one span underlined in the
      original with a small marker matching the panel entry.
    - **Recommended next action** — a single one-line suggestion.
  - Local-mode status pill ("Local — LM Studio") in the panel chrome.
- **Why it sells:** This is the screenshot users decide on. It shows the
  surface, the anchoring (which differentiates the extension from a
  generic LLM chat box), and the local-mode pill that proves the
  privacy claim isn't just copy.

---

## Shot 5 — Proactive-guardrails toolbar badge after a hyperfocus trip

- **Filename:** `05-guardrail-badge-hyperfocus.png`
- **Dimensions:** 1280 × 800 PNG
- **What is in the frame:**
  - The toolbar in the top-right of the browser, zoomed in slightly so
    the NeuroDock action button and its badge are legible (use a 1.5×
    or 2× window-zoom screenshot then downscale).
  - The action icon shows the **hyperfocus** badge state — a small
    contrasting dot, not the default icon.
  - Below it, the popup open and showing the **hyperfocus advisory**
    card: a short, non-clinical message offering a break, with two
    buttons ("Take 5", "Dismiss").
  - The advisory card is the proactive-guardrails surface, not a
    modal — the rest of the popup is still usable beneath it.
- **Why it sells:** The proactive guardrails are the v0.0.24 headline
  feature and the most distinctive part of the manifesto. The shot has
  to show the badge **and** the advisory in the same frame so the
  reviewer sees the entire mechanism in one glance.

---

## Post-capture checklist

- [ ] All five PNGs are exactly 1280 × 800.
- [ ] No personal data anywhere — sign-in fixtures only.
- [ ] No notification toasts, no taskbar, no bookmarks bar.
- [ ] Default Chrome theme (no dark mode, no Material You).
- [ ] Filenames match `01-…` through `05-…`.
- [ ] Stored somewhere durable — not Desktop, not Downloads.
- [ ] Upload in numerical order on all three stores.
