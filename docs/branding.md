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

## 3. Hero image briefs (3 prompts for `/higgsfield-generate`)

### 3.1 Shared constraints — every prompt

Every prompt must include this avoid clause verbatim, because the cliché list is what most "AI tool" hero images get wrong:

> **Avoid:** people's faces visible, screens or monitors or phones showing UI, corporate stock-photo aesthetic, glass office, whiteboard meeting, brain-with-cogs cliché, lightbulb moment, puzzle pieces, motion blur, chromatic aberration, neon, holographic, multiple competing colours, text or wordmarks rendered in the image, hands holding phones, headsets, hoodies, "founder portrait" framing.

> **Use a single neutral accent colour if any — desaturated slate-blue around `#5a6a8f` (sRGB) — consistent with `docs/public/og-image.svg`. Otherwise off-white, warm wood, paper, and natural shadow.**

Format request for all three: **square (1:1)** or **3:2 landscape** at high resolution; documentary / still-life register, not advertising.

### 3.2 Prompt 1 — Calm-clinical-but-warm (substrate angle)

```
A clean still-life on a warm pale wood surface, soft natural window light from
the upper left, late morning. Centre: a small neat stack of three blank index
cards held by a thin neutral paper-band, slightly offset so the edges show.
To the right of the cards: a small brass-and-glass sand-timer (hourglass)
lying on its side, sand paused. Behind both, a single folded sheet of cream
paper with a faint horizontal rule line, the paper catching the light at the
fold. Shallow depth of field, focus on the cards. Documentary editorial still-
life style, in the register of a quiet design magazine: Kinfolk, Apartamento,
Cereal magazine. Composition uses negative space; the subjects sit in the
lower-left third with calm empty space above. Single neutral accent: a thin
slate-blue (#5a6a8f) thread on the paper-band around the cards — that is the
only colour, everything else is paper, wood, and warm shadow. No people. No
hands. No screens. No text. No diagrams. No brain shapes. No cogs. No
puzzle pieces. No motion blur, no chromatic aberration. Real photographic
texture; no CGI sheen.
```

Intent: this is the substrate image. The cards stand in for memory, the hourglass for time, the paper for translation/notes. Visually says "calm tools that help you remember things" without showing any UI.

### 3.3 Prompt 2 — Cognitive augmentation as craft (workbench angle)

```
A documentary-style overhead shot of a wooden workbench in afternoon light.
On the bench: an open spiral-bound notebook, the left page with hand-drawn
arrows and small bracketed annotations (no readable words — abstract pen
marks only), the right page partly filled with a hand-drawn flowchart in
neat blue-grey ink, three connected boxes. To the right of the notebook,
a small wooden card-index drawer with brass label-holders, slightly open,
a few unlabelled white cards visible. A blunt pencil sits across the
notebook spine. A single piece of unbleached cotton string runs diagonally
across the lower-right corner of the composition, suggesting tied-together
work. Warm overhead window light, soft shadows. Editorial photography in
the register of a craft-magazine workshop feature — Real Simple, The Gentle-
woman, or a Japanese stationery catalogue. Texture is paramount: visible
grain of the wood, slight fibre of the paper. No people, no hands visible
in frame; the bench is mid-task and unattended. No screens. No phones. No
keyboards. No text legible anywhere. No "lightbulb moment" cliché. No
brain illustration. Single accent colour is the slate-blue (#5a6a8f) of
the flowchart ink — every other tone is wood, paper, and warm shadow.
```

Intent: this is the "tool that helps you think, not for you" image. The annotations and the card-index together suggest an externalised executive function without showing software at all.

### 3.4 Prompt 3 — Neurodivergent-led software (quiet desk angle)

```
A medium-wide eye-level photograph of a quiet personal desk in late
afternoon — golden-hour window light raking across the right side. On the
desk: a short stack of two or three well-used books spine-out (no readable
titles — slight wear, cloth binding), a small terracotta pot with a leafy
trailing plant (string-of-hearts or pothos), a plain off-white ceramic mug
half-full of black coffee, a small notepad open to a page showing a
hand-drawn flow diagram — three small boxes connected by arrows, drawn in
slate-blue (#5a6a8f) pen. A pair of round wire-frame reading glasses
folded on top of the notepad. The diagram is the only synthetic structure
in the frame; everything else is lived-in domestic. Style register:
documentary editorial photography of a writer's or scholar's desk — not
a tech founder's setup, not a "creator workspace" Instagram aesthetic.
Think Apartamento magazine interiors, or a New Yorker writer-at-home
feature. Soft natural light, no studio flash, no rim lighting. No screens
visible: no laptop, no monitor, no phone. No people, no hands. No
brand logos, no readable text, no wordmarks. No motion blur, no
chromatic aberration. Single neutral accent: the slate-blue diagram ink;
everything else is wood, paper, plant, ceramic, warm shadow.
```

Intent: this is the "built with, not for" image. The substrate is invisible — what you see is a person's actual workspace, with one small marker (the Mermaid-style diagram) that says "this person uses NeuroDock" without selling them anything.

### 3.5 Generated image candidates

**Status: not generated this session.**

The `/higgsfield-generate` skill was listed as available, but the underlying
`mcp__higgsfield__*` tool schemas could not be loaded in this session
(ToolSearch queries for `higgsfield`, `nano-banana`, and `image generation`
returned no Higgsfield tools). **The three prompts above are written ready-
to-paste — generation needs a manual follow-up.**

To run them when the MCP is available, recommended approach:

- **Model:** `nano-banana-2` (per the higgsfield-generate skill default).
  Image-only brief, no character/identity continuity needed across the
  three, so the default is correct.
- **Aspect ratio:** start with 1:1 (square) for social-card use, optionally
  re-run the winners at 3:2 landscape for the docs hero.
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
