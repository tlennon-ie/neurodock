# NeuroDock — branding working document

> Internal-facing. Not a published docs page. This is the maintainer's reference
> for the slogan, descriptions, and hero-image direction. Drafted 2026-05-21.

This document does three things:

1. Reports the **name research** — is "NeuroDock" still ours to own?
2. Proposes a **slogan, GitHub repo description, docs-site meta, and 80-word elevator pitch.**
3. Captures the **three hero-image briefs** (and their generation status).

The maintainer picks. Nothing user-facing has been changed.

---

## 1. Name research

### 1.1 GitHub conflicts

Searched `gh search repos "neurodock"`. Three categories of hit:

| Repo                                                                                          | Stars  | Verdict                                                                                                                         |
| --------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------- |
| [`ReproNim/neurodocker`](https://github.com/ReproNim/neurodocker)                             | 357    | Different word ("neuro**docker**"), well-established neuroimaging Docker generator. Google-confusable but not a name collision. |
| `dmri/neurodock` (Docker Hub) + PyDesigner docs                                               | n/a    | Neuroimaging dMRI Docker image. Niche audience. Low collision risk.                                                             |
| `mpiress/NeuroDock`, `aryanputta/NeuroDock`, `wselbyGPT/NeuroDock`, `3078024889/NeuroDock-AI` | 0 each | Abandoned / personal repos. Zero stars, no community. Effectively non-conflicts.                                                |

**No GitHub project of any size uses the exact "neurodock" name with our positioning.**

### 1.2 Web conflicts

Spot-checked with `WebSearch`. One real adjacent-space hit:

- **[`neurodock.io`](https://neurodock.io/)** — positions itself as "NeuroDock — AI Agent Framework" for power users. Lightweight site, no public team / founder / press surface in search results, no LinkedIn presence. Unknown maintenance level (the page returns 200 but is hard to fully crawl). **This is the meaningful one to be aware of:** an adjacent product in the AI-agent space using the same wordmark, no apparent traction, no trademark filing turned up.

Other web hits are the neuroimaging Docker tools above, plus a 2013 IEEE paper on `hppNeuroDock` (drug-docking software, unrelated namespace).

### 1.3 Trademark

`WebSearch "neurodock" site:uspto.gov OR site:euipo.europa.eu` returned **no live trademark registrations** for the mark "NeuroDock". A NeuralDock paper exists (different word). The USPTO `tmsearch.uspto.gov` and EUIPO databases would be the place for a definitive answer if registration ever becomes a goal; for now, the runway is clean from a trademark-conflict-with-third-party perspective.

### 1.4 Package & social handle runway

| Channel                                        | Status                                                                                                                                               | Notes |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| **PyPI** — `neurodock-*` namespace             | **Owned.** `neurodock-mcp-chronometric`, `neurodock-clinical`, etc. already published.                                                               |
| **npm** — `@neurodock` org                     | **Owned.** `@neurodock/cli` already published under AGPL-3.0-or-later.                                                                               |
| **npm** — bare `neurodock` package             | **Available** (npm registry 404). Worth squatting defensively if not already done.                                                                   |
| **GitHub** — `github.com/tlennon-ie/neurodock` | **Owned.** A `neurodock` GitHub org does not currently exist; the project lives under the maintainer's user account. Worth registering the org name. |
| **Domain** — `neurodock.io`                    | **Taken** (see 1.2).                                                                                                                                 |
| **Domain** — `neurodock.org`                   | The README references `docs.neurodock.org` as the deployment target; treat as owned/intended.                                                        |
| **Twitter/X** — `@neurodock`                   | Status unclear from HTTP probe (X 301s everywhere). Worth a manual check.                                                                            |
| **Mastodon** — `@neurodock@mastodon.social`    | **Available** (404 on profile page).                                                                                                                 |
| **Bluesky** — `neurodock.bsky.social`          | Inconclusive from HTTP (SPA returns 200 for anything). Worth a manual check.                                                                         |
| **Discord** — `neurodock` vanity URL           | Manual check needed; vanity URLs require boost tier.                                                                                                 |

### 1.5 Verdict

**Keep the name.** The runway is clear on the registries we actually publish to (PyPI, npm under our scope), the GitHub repo name has no community conflict, and no trademark blocks us. The one real adjacent-namespace use is `neurodock.io` ("AI agent framework"), which is small enough that we likely win the SEO battle through documentation depth and the GitHub repo. Recommended defensive moves: (a) register the `@neurodock` GitHub org name, (b) take the bare `neurodock` npm package as a redirect to `@neurodock/cli`, (c) claim `@neurodock` on Mastodon, Bluesky, and X if not already.

---

## 2. Slogan + descriptions

### 2.1 The voice constraints (from MANIFESTO.md, ETHICS.md, PRIVACY.md, index.mdx)

- Direct. Plainspoken. No fluff.
- Specific over abstract. "Refuses to re-validate closed decisions" beats "thoughtfully designed".
- ND-aware, never ND-cosplay. No "neurospicy", no "brain on hard mode".
- Built **with**, not **for**. Self-ID sufficient; never gates on diagnosis.
- No hustle vocabulary (`supercharge`, `10x`, `unlock`, `level up`).
- Local-first. No telemetry. AGPL-3.0-or-later.

### 2.2 Slogan candidates — three angles

**Candidate A — lived-experience-led angle**

> **"Built with neurodivergent professionals, not for them."**

Reasoning: This is the manifesto's pre-existing one-liner, polished. It's the strongest plain statement of the project's epistemic stance. The word "professionals" anchors it (not children, not patients). The "with, not for" hinge is doing the heavy lift — it signals self-ID without saying "self-ID", and it preempts the "is this a treatment?" reading. The risk: it sounds slightly like a corporate diversity tagline, and it doesn't tell you what the thing **is**.

**Candidate B — technical-substrate angle**

> **"Memory, time, and a refusal to amplify rumination — for any MCP client."**

Reasoning: Specific, concrete, no fluff. Names three of the substrate's actual jobs (memory = cognitive-graph, time = chronometric, refusal = guardrail). The "for any MCP client" tail makes the vendor-neutral / local-first commitment legible to a developer skimming. Risk: 14 words is at the upper limit, and "MCP" is jargon for anyone who hasn't met the protocol yet. Strong on docs site and PyPI, weaker on a billboard.

**Candidate C — "what it does for you" angle**

> **"A cognitive substrate that remembers, paces, and refuses."**

Reasoning: Three verbs, each tied to one of the three pillars (cognitive → remembers, chronometric → paces, guardrail → refuses). Reads in under two seconds. "Refuses" is the interesting word — most AI-tool slogans promise capability; this one promises restraint. The risk: "cognitive substrate" is still a coined phrase the reader has to parse; "paces" is slightly soft for what chronometric actually does.

### 2.3 Winner — and why

**Winner: Candidate C — "A cognitive substrate that remembers, paces, and refuses."**

Reasoning:

- It passes the "tired person on a phone" test — three verbs, one noun phrase, comprehensible in under two seconds.
- It carries the most distinctive single word in the slogan space: **"refuses"**. Nothing else on the AI-tool shelf says that. It signals the guardrail layer instantly and differentiates from `neurodock.io` and every other "AI assistant" pitch on the page.
- It is specific without being jargony. "Substrate" is the existing site vocabulary (the index.mdx already uses it). "Remembers / paces / refuses" maps onto the three pillars without naming them.
- It does not gate on neurotype, does not say "for the neurodivergent", and does not require the reader to opt-in to an identity before they read the next line. That keeps the "self-ID sufficient" principle intact at the top of the funnel.
- It pairs cleanly with **Candidate A as a sub-headline** — the docs hero can read: _"A cognitive substrate that remembers, paces, and refuses. Built with neurodivergent professionals, not for them."_ That combination covers both angles without doubling the cognitive load.

Candidate A is the strongest **values** statement; Candidate C is the strongest **product** statement. Use C as the primary slogan, A as the supporting line beneath it.

### 2.4 GitHub repo description (350 char limit)

> **A local-first cognitive substrate for neurodivergent professionals. Gives Claude memory, a sense of time, a translator for corporate ambiguity, and a guardrail that refuses to amplify rumination, hyperfocus, or sycophancy. MCP-native. No telemetry. AGPL-3.0-or-later. Self-ID sufficient — no diagnosis gating.**

Character count: ~340. Passes the scroll test: each clause is one concrete capability or commitment. No marketing verbs.

### 2.5 Docs-site meta description (160 char limit)

> **Local-first cognitive substrate for neurodivergent professionals. Memory, time, and a guardrail that refuses to amplify rumination. MCP-native. No telemetry.**

Character count: ~158. Compatible with the slogan; uses the same vocabulary as the GitHub description so SEO snippets stay consistent across surfaces.

### 2.6 Elevator pitch — 80-ish words

> **NeuroDock is an open-source, local-first cognitive substrate for neurodivergent professionals. It gives any MCP-aware AI client — Claude Desktop, Claude Code, Cursor — a persistent memory of your work, a sense of time and sessions, a translator for corporate ambiguity, and a clinical guardrail that refuses to amplify rumination, hyperfocus, or sycophancy. Built with neurodivergent professionals, not for them. Self-identification is sufficient; we never ask for a diagnosis. No telemetry. AGPL-3.0-or-later. Reusable on PyPI and npm.**

Word count: 78. Designed to drop into the docs index hero, the `@neurodock/cli` npm description (after trimming for npm's char limit), and the PyPI long-description front matter.

---

## 3. Brand-asset prompts (icon / logomark / wordmark — for `/higgsfield-generate`)

> **First-pass note:** the original prompts here were photographic still-lifes (Kinfolk / Apartamento register) — useful for marketing moodboards but useless as actual brand assets. An app needs an **icon** that survives at 16×16, a **logomark** that works on both light and dark surfaces, and a **wordmark** that pairs with the mark. The prompts below target those three deliverables directly.

### 3.1 Shared constraints — every prompt

Every prompt must include this avoid clause verbatim:

> **Avoid:** photorealism, 3D rendering, gradients, neon, holographic, bevel, drop-shadow, skeuomorphism, brain-with-cogs cliché, lightbulb, puzzle pieces, infinity loop, geometric over-complication. No fine detail that disappears at 16px. No more than two colours. No serifs unless the wordmark explicitly calls for them. No "AI" symbolism (no circuit traces, no scanlines, no nodes-and-edges flourish).

> **Palette:** a single foreground in **desaturated slate-blue `#5a6a8f`** on a clean **off-white `#f6f4ee`** background (or the inverse for dark-mode variants). The accent matches `docs/public/og-image.svg`.

> **Style:** flat vector. Geometric. Two colours max. Designed to read as a recognisable mark at 16px, 48px, 128px, AND 1024px without losing identity.

### 3.2 Prompt 1 — App icon (the primary mark)

**Goal:** the icon that ships in the Chrome extension toolbar, the docs site favicon, and the GitHub social card. Square. Recognisable at 16×16. Survives without context.

```
Flat vector app icon, square 1024×1024, designed for an open-source
neurodivergent-supportive AI tool called NeuroDock. Concept: a stylised
geometric monogram — the letters "n" and "d" interlocked as one continuous
soft-cornered shape, set inside a rounded-square container with generous
internal padding (iOS / Chrome extension icon shape, ~22% corner radius).
The interlocking implies "things held together calmly," not "complexity."
Single colour foreground: desaturated slate-blue (#5a6a8f). Single colour
background: warm off-white (#f6f4ee). Two colours only. Crisp geometric
construction with consistent stroke weight. No gradients, no shadows, no
3D, no bevels, no glow, no texture. No serifs. The mark should read clearly
at 16×16 pixels and survive as a flat silhouette without context. Style
register: design system app icons in the lineage of Notion, Linear, Raycast,
1Password — calm, geometric, single-accent, immediately legible. Not
"corporate tech" (no abstract spheres, no fragmentation). No brain shapes,
no lightbulbs, no cogs, no neural-network lines, no AI symbolism. Centred,
balanced negative space around the monogram.
```

Intent: this is the one image that has to work. It becomes the Chrome extension icon (16/32/48/128px), the GitHub social card mark, the docs favicon, and the only thing most users see.

### 3.3 Prompt 2 — Horizontal logomark + wordmark lockup

**Goal:** the header banner — mark on the left, "NeuroDock" wordmark to the right of it. For the docs site header, the GitHub README banner, the npm package readme.

```
Flat vector horizontal lockup, 1600×400 canvas, off-white background
(#f6f4ee). Left half: a small flat-vector logomark, ~280px wide, rendered
in desaturated slate-blue (#5a6a8f). The mark is a clean geometric "n-d"
monogram inside a soft-cornered square — calm, balanced, readable at small
sizes. Right of the mark, separated by generous horizontal padding (~120px
gap): the wordmark "NeuroDock" set in a clean sans-serif typeface in
matching slate-blue (#5a6a8f). Suggested typeface lineage: Inter, Söhne,
or Atkinson Hyperlegible (the project's body font) — modern, humanist,
slightly rounded, high legibility for dyslexic readers, no decorative
flourishes. Mark and wordmark are vertically centred and visually aligned;
the wordmark cap-height matches roughly 60% of the mark height. The "N"
and "D" in "NeuroDock" are capitalised; everything else lowercase. NO
tagline rendered in the image. NO underline, NO decorative line beneath.
Two colours only: slate-blue on warm off-white. Flat vector, no
gradients, no shadows, no bevels, no 3D. Generous horizontal whitespace
on both sides of the lockup so the image can be cropped or padded.
```

Intent: the docs header, the GitHub README badge, the npm hero. Pairs with the slogan in copy but doesn't render it in pixels (text-in-image rots fast and breaks i18n).

### 3.4 Prompt 3 — Alternative concept (substrate-stack mark)

**Goal:** a different mark concept to choose between. Same target sizes as Prompt 1, different visual metaphor — the substrate-stack instead of the monogram.

```
Flat vector app icon, square 1024×1024, alternative concept for the same
NeuroDock brand. Concept: three offset rectangles stacked diagonally — the
top-right rectangle slightly forward, the bottom-left slightly back —
suggesting three layers held loosely together. A single thin horizontal
line (a "thread") passes across all three rectangles at the same height,
binding them. The rectangles imply "memory cards" or "structured layers";
the thread implies "the substrate that holds them together." Single
colour: desaturated slate-blue (#5a6a8f) foreground on warm off-white
(#f6f4ee) background. Two colours total. Flat vector. Set inside a soft
rounded-square container (same ~22% corner radius as Prompt 1 for icon-
shape consistency). The mark must read at 16×16 — so use no more than
three rectangles, no internal detail inside the rectangles, and a thread
weight thick enough to survive scaling. No gradients, no shadows, no
3D, no bevels, no texture, no AI symbolism. Style register: calm
geometric marks in the lineage of Things 3, Bear, Craft, Reflect —
single-concept, single-colour, recognisable instantly. Centred, balanced
composition with even padding inside the rounded-square container.
```

Intent: an alternative to the monogram. If the "nd" interlock from Prompt 1 reads as too abstract or doesn't survive at 16px, this substrate-stack metaphor is more literal to what the product does.

### 3.5 Generation status + recommended command

**Status: not generated this session — account at 0.3 credits, generation refused with `not_enough_credits` on first attempt.**

When credits are topped up, run each prompt with:

```sh
# Prompt 1 — App icon (the primary mark)
higgsfield generate create gpt_image_2 \
  --prompt "<paste full Prompt 1 text>" \
  --aspect_ratio 1:1 \
  --resolution 2k \
  --wait

# Prompt 2 — Horizontal lockup
higgsfield generate create gpt_image_2 \
  --prompt "<paste full Prompt 2 text>" \
  --aspect_ratio 4:1 \
  --resolution 2k \
  --wait

# Prompt 3 — Substrate-stack alternative
higgsfield generate create gpt_image_2 \
  --prompt "<paste full Prompt 3 text>" \
  --aspect_ratio 1:1 \
  --resolution 2k \
  --wait
```

Recommended model: **`gpt_image_2`** (NOT nano-banana-2). The higgsfield model catalog flags `gpt_image_2` as "default for graphic design, UI, banners, typography" — exactly what brand assets need. Nano-banana is tuned for stylized / character / cartoon work and will lean illustrative when we want flat-vector geometric.

Iteration order: generate Prompt 1 first. If the monogram comes back as cartoon or 3D, tighten the "flat vector" / "no 3D" clauses before spending budget on 2 and 3. If Prompt 1 fails the 16px-survival test, fall back to Prompt 3 (substrate-stack) which has stronger geometric primitives.

Once a winner is picked, the raster output is the source for `docs/public/favicon.svg`, `packages/extension-browser/public/icon/{16,32,48,128}.png`, and the docs site `hero.image`. Hand-tracing the raster into a clean SVG is a 30-minute job in Figma / Affinity / Inkscape — don't ship the raster as the final logo.

- **Iteration order:** generate Prompt 1 first; it has the strictest
  composition (still life), which is the best signal of whether the
  avoid-clause is being honoured. If Prompt 1 comes back with text in
  the image or visible UI, tighten the negative prompt before spending
  budget on 2 and 3.
- **Job IDs / image URLs:** record them in a new sub-table here once
  generated, one row per prompt: `Prompt #`, `Model`, `Job ID`, `Image URL`,
  `Pass/Fail vs avoid-clause`, `Notes`.

---

## 4. Recommended downstream edits — checklist

If the maintainer adopts the winning slogan and descriptions, here are
the surfaces that would need touching. **Do not change any of these
without explicit go-ahead** — this checklist is documentation of the
blast radius, not a work order.

- [ ] `README.md` line 3 — the blockquote TL;DR currently reads
      _"Open-source, MCP-native, vendor-neutral, local-first cognitive substrate
      for neurodivergent people."_ — replace with the Candidate C + A pairing
      (slogan + sub-headline) **or** the 350-char GitHub description, depending
      on which surface the README is meant to mirror.
- [ ] GitHub repo "About" — paste the §2.4 description verbatim.
      Settings → "About" → Description.
- [ ] `docs/src/content/docs/index.mdx` frontmatter `description:` — replace
      with the §2.5 docs-site meta description.
- [ ] `docs/src/content/docs/index.mdx` `hero.tagline` — replace with the
      Candidate C + A pairing.
- [ ] `docs/astro.config.mjs` site `description` field if it duplicates the
      index frontmatter (check for drift).
- [ ] `docs/public/og-image.svg` lines 68 and 78 — the tagline text
      _"Local-first cognitive substrate / for neurodivergent professionals."_
      could be updated to the new slogan if the maintainer wants the social-
      share card to match. **Optional** — the current OG card already aligns
      with the docs-site meta and is consistent with the brand voice.
- [ ] `packages/cli/package.json` `description` — currently _"NeuroDock
      installer and diagnostic CLI."_ — leave as-is (it describes the package,
      not the product) **or** swap for a trimmed product line if marketing on
      the npm page matters more than describing the package.
- [ ] Each PyPI package's `pyproject.toml` `description` — same call as
      above; per-package descriptions describe the package, not the product.
- [ ] `MANIFESTO.md` paragraph 1 — currently
      _"NeuroDock is an open-source, local-first cognitive substrate for
      neurodivergent professionals, built with — not for — the people who
      need it."_ — this is already aligned with the new slogan + sub-headline.
      **No change needed.**
- [ ] Social handle defensive registrations: `@neurodock` on GitHub org,
      Mastodon, Bluesky, X. `neurodock` bare npm package as a redirect to
      `@neurodock/cli`.
- [ ] Once hero images are generated and the maintainer picks one, add it
      to `docs/public/` and reference from `docs/src/content/docs/index.mdx`
      hero block (Starlight `hero.image` field). Keep the SVG OG card as-is
      for social share — it renders without external fonts and survives
      GitHub's preview server.
