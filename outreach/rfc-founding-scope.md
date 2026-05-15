Title: `RFC: Founding scope and architecture`

---

## Motivation

Neurodivergent professionals already cobble together their own AI tooling. There is a Claude Code skill pack for ADHD here, a hyperfocus formatter there, a Mermaid visualiser somewhere else, a multi-tier memory system in a fourth repo. Each one is good. None of them compose. Every ND professional is doing the same integration work in private, and most give up before they finish.

At the same time, the unmodified LLM is actively unsafe for parts of this audience. Sycophantic agreement reinforces rumination loops. Lack of time-awareness fuels hyperfocus past stated end-times. There is no shared substrate that treats this as an engineering problem.

NeuroDock is the consolidation. One open-source, MCP-native, local-first cognitive substrate, built by ND contributors using the very system being built. Lived-experience governance. Clinical advisory board. AGPL. No telemetry by default.

This RFC opens that consolidation to the people who would actually use and build it.

## Proposal

Three pillars, one shared MCP-native architecture.

**Pillar 1 — Substrate.** Skills and MCP servers that externalise executive function. Time and break awareness (`mcp-chronometric`). Persistent entity and decision memory (`mcp-cognitive-graph`). Task decomposition (`mcp-task-fractionator`). A profile system at `~/.neurodock/profile.yaml` that drives adaptation. Six launch skills covering daily planning, context recovery, meeting translation, decision finality, hyperfocus formatting, and visual organisation.

**Pillar 2 — Communication layer.** Bidirectional corporate-communication translation. One browser extension (WXT / MV3) plus one MCP server (`mcp-translation`) sharing one prompt library and one versioned eval corpus. Local-only by default; cloud opt-in with a persistent banner.

**Pillar 3 — Clinical guardrails.** Middleware (`mcp-guardrail`) that detects rumination loops, unregulated hyperfocus, and sycophantic over-validation. Heuristics are public. Thresholds are user-configured at setup, not under duress. Every intervention is transparent and overridable.

**Architecture.** Local-first SQLite plus `sqlite-vec`. JSONL event log. FastMCP for servers (TypeScript only where browser context demands it). No vendor lock-in: adapters for Anthropic, OpenAI, and local Ollama / LM Studio sit behind a single interface. The monorepo is `pnpm` plus `uv` workspaces with Turborepo caching.

**Phased delivery.** Phase 0 (month 1) scaffolds the project. Phase 1 (months 2–3) ships the substrate MVP as `v0.1`. Phase 2 (months 4–7) ships the browser extension and rumination guardrail. Phase 3 (month 8+) ships the full guardrail set, position paper, plugin marketplace, and federation.

Full plan: `plan.md` in the planning bundle. The architecture diagram is in §3, the tech stack in §4, the repo structure in §5, the three pillars in §6–8, and the roadmap in §11.

## Alternatives considered

**Fork Leantime.** Leantime is excellent ADHD-friendly project management with an MCP server. It is also a full PHP web application with its own scope. NeuroDock sits one layer down — the cognitive substrate that any client (Leantime included) can consume. Forking would replace that substrate with a product. We would rather integrate with Leantime than absorb it.

**Build on top of an existing skill repo.** `ravila4/claude-adhd-skills`, `nextor2k/hyperfocus`, `assafkip/kipi-system`, and `JackReis/neurodivergent-visual-org` each solve a real slice of the problem. None of them aim to be the substrate. Adopting one as the base would either constrain the others or quietly fork them. The honest move is to credit them, invite their maintainers to participate, and build the composable layer underneath.

**Do nothing.** Let the ecosystem stay fragmented. This is the path of least effort and the path most ND professionals are already on. The cost is a permanent integration tax paid by every user and a permanent missed opportunity to build clinical guardrails into the substrate before bad defaults entrench.

## Open questions

1. **Licence.** Working assumption is AGPL-3.0 for core packages, with the eval corpus under a separate consented-data licence. Confirm before scaffold lands.
2. **Council seating.** Five seats, two-year staggered terms, at least three reserved for lived-experience contributors. How do we seat the founding cohort? Open call plus founder-nominated, or open call only?
3. **Clinical advisory recruitment.** Target five seats; minimum two to launch Phase 1. Who do we approach first, and what is the time commitment we are honestly asking for?
4. **Namespace timing.** `github.com/neurodock`, `npm:@neurodock/*`, `pypi:neurodock-*`, `neurodock.org`, OpenCollective. Reserve all in week 1 of Phase 0, or wait until the RFC has settled?

## Success criteria

Phase 0 exits when all of the following are true (from `plan.md` §11):

- Monorepo scaffold merged. CI green from commit one.
- `MANIFESTO.md`, `GOVERNANCE.md`, `CODE_OF_CONDUCT.md`, `ETHICS.md` published and merged.
- This RFC open with substantive responses incorporated.
- At least three external contributors signed up to a specific package or skill.
- At least two clinical advisors confirmed.
- Namespaces locked on GitHub, npm, PyPI, OpenCollective. Domain purchased.

Target month-end snapshot: 50 stars, 10 committed contributors, 2 confirmed clinical advisors, end-to-end demo of one skill against `mcp-chronometric`.

## How to respond

Comment on this issue. Anything is welcome: a single-line objection, a long-form alternative, a "I will build skill X", a "I will advise on Y", or a "this is wrong, here is why". Direct disagreement is preferred over polite hedging.

The council meets at the end of Phase 0 week 4 to consolidate responses and decide what merges, what changes, and what gets deferred. Decisions and reasoning will be posted back to this issue.

If you would rather not comment in public, email the founding maintainers. Contact details are in the README.

---

Labels: rfc, governance, phase-0
