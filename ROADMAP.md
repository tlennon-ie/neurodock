# Roadmap

NeuroDock is a community project with strong opinions about scope. The
roadmap is **directional, not contractual.** Issues with milestones are
authoritative when they disagree with this file.

Everything below is grouped in rough quarterly buckets so contributors
can pick work that lines up with their interest. If a quarter passes
without something landing, that's fine — this is volunteer work, not a
ship list. If you want to drive any of these, open an issue or comment
on the existing one.

> Updated: 2026-06-10.

## Shipped (Q2 2026)

Landed since the v0.2.1 developer preview:

- [x] **Real LLM provider wiring in the browser extension** —
      Ollama (local default), Anthropic, OpenAI, and OpenRouter (incl.
      `openrouter/auto`, the OpenRouter auto-router that picks the best
      model per query). Landed in PR #33 / extension v0.0.2.
- [x] **Profile presets** — nine curated YAML defaults under `profiles/`:
      adhd, audhd, ocd, dyslexic, low-stimulation, dyspraxia,
      burnout-recovery, educator-semester, student-university.
- [x] **CLI ergonomics** — `install-all` (one-command first-time install),
      `examples` (prompt cheat-sheet per wired server), and
      `plugin add/remove/list/enable/disable/validate`. Landed in CLI v0.4.0.
- [x] **Plugin examples** — 15 plugins shipped under `plugins/`:
      8 skill plugins (civil-servant-briefing, eng-manager-1on1,
      lawyer-matter, pm-stakeholder-juggle, researcher-litreview,
      software-engineer-daily, writer-long-form, plus the
      `example-skill-pomodoro` template) and 7 translation packs
      (customer-support, german-directness, healthcare,
      hiberno-english, japanese-keigo, legal, sales).
- [x] **Good-first-issue ramp** — 10 tickets filed; 9 closed across the
      v0.2.x cycle (see GitHub `good first issue` label).
- [x] **Proactive guardrails** — three-phase auto-fire layer for
      hyperfocus / rumination / sycophancy / late-night signals.
      Phase 1: `neurodock install-hooks` wires a stdlib-only Python
      hook into Claude Code (CLI v0.6.0). Phase 2: browser-extension
      watchdog with toolbar-badge nudge (extension v0.0.24). Phase 3:
      standalone autostart daemon for host-agnostic coverage. Opt-out
      via `NEURODOCK_GUARDRAILS=off` or `install-hooks --uninstall`.
      Design page: `/concepts/proactive-guardrails/`.
- [x] **Per-neurotype prompt tailoring** — `buildNeurotypeAddendum`
      shapes all five translation prompts per ADHD / ASD / AuDHD / OCD /
      dyslexia / dyspraxia / Tourette / other. Reader-preferences UI in
      Settings. Empty addendum for default profile, so existing installs
      see no prompt change until they opt in. Landed in extension
      v0.0.22 (2026-05-24).
- [x] **LM Studio + Gmail silent-failure fix** — service-worker keepalive
      defeats the MV3 idle kill mid-fetch; ACK contract on
      `chrome.tabs.sendMessage` defeats the ambiguous-resolution
      delivery bug. The top outstanding extension bug; closed in
      v0.0.24 (2026-05-24).
- [x] **Panel on any site (generic content-script injection)** — the
      in-page panel now mounts on LinkedIn and other sites that aren't
      in the nine declared `host_permissions` matches. Landed in
      extension v0.0.23.
- [x] **`record_fact` friendly errors** — `ToolError` payload gained
      `hint` and `example` so wrong-shape input gets actionable guidance
      instead of raw Pydantic errors. Closes the six-retry validation
      loop documented on 2026-05-22. Landed in mcp-cognitive-graph
      v0.0.4 (2026-05-24).
- [x] **Distribution channels** — the five servers are published to the
      official MCP Registry (`registry.modelcontextprotocol.io`, namespace
      `io.github.tlennon-ie/*`), plus a Claude Code plugin, per-server
      `.mcpb` Desktop Extensions, and an `awesome-mcp-servers` listing.
      Recorded in ADR 0008.
- [x] **Hosted remote MCP server** — the stateless tools (translation,
      guardrail, `decompose`) are served over OAuth at
      `https://mcp.neurodock.org/mcp` (Cloudflare Containers + Clerk).
      Addable as a custom connector with no local install. The cognitive
      graph and profile are never hosted. ADR 0009.
- [x] **Opt-in hosted state** — signed-in users can enable per-account
      NeuroDock-hosted storage (a private Turso database) or bring their
      own libSQL/Turso DB, with explicit consent and one-call erasure.
      Default stays stateless/local; anonymous sessions store nothing.
      ADR 0010.

## Now — Q2 2026

**Theme:** make the developer preview comfortable to actually use.

- [ ] **Browser-store submissions** — Chrome Web Store, Firefox Add-ons,
      Edge Add-ons. Build artefacts and promo/icon assets are ready;
      developer accounts + the five listing screenshots + privacy
      disclosures remain the manual steps.
- [ ] **Demo GIF / video** (issue #27) — a short video remains the
      lowest-friction "see it work" surface.
- [x] **Docs site DNS** — `neurodock.org` and `docs.neurodock.org` now
      serve the Astro Starlight build from Cloudflare.

## Next — Q3 2026

**Theme:** translate the substrate into measurable benefit.

- [ ] **Eval corpus growth** — 100 anonymised examples across translation
      and guardrail tasks; contribution pipeline well-trodden.
- [ ] **Translation language packs** — Hiberno-English, German directness
      norms, Japanese keigo. Out-of-tree plugins per ADR 0007.
- [ ] **`mcp-translation` v0.1.0** — LLM refinement envelope wired to
      real providers behind the same MCP contract the extension uses.
- [ ] **`mcp-cognitive-graph` semantic recall** — embedding rung tuned
      with real corpora; benchmark suite checked into `packages/evals/`.
- [ ] **`@neurodock/extension-browser` published** to store(s) and
      promoted on the docs site.

## Later — Q4 2026 and beyond

**Theme:** durability and community.

- [ ] **Plugin marketplace** — a docs page that lists discovered
      third-party plugins with install snippets.
- [ ] **Hosted profile sync (opt-in)** — a small server-side component
      for users who want their profile shared between devices. Default
      remains local-only.
- [ ] **`neurodock-clinical` heuristics expansion** — formalised library
      of detector primitives shared across servers.
- [ ] **i18n of the CLI and extension** — at least one non-English
      locale fully covered end to end.
- [ ] **A formal `0.x → 1.0` review** — protocol stability, semver
      guarantees on MCP tool contracts, ADR for breaking-change policy.

## Explicit non-goals

We have a manifesto for a reason. Things we are **not** building:

- A NeuroDock app. The surface is your Claude client; we add tools to
  that client, not a new product.
- Telemetry. Ever.
- A diagnostic tool. Self-ID sufficient; no claims of clinical accuracy.
- A SaaS tier behind core features.
- AI that fuels rumination, hyperfocus, or anxiety — the guardrail
  pillar exists to refuse that.

If you want one of these, the answer is "fork it" — AGPL guarantees you
can.

## How to influence this

- **Smallest possible PR:** pick a `good-first-issue` and ship it.
- **Bigger ideas:** open an RFC issue using `.github/ISSUE_TEMPLATE/rfc.md`.
- **Disagreements with this file:** open a discussion. The manifesto
  trumps the roadmap when they conflict; the roadmap trumps maintainer
  whim.
