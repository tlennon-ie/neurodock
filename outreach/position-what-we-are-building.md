# What we are building and why

Neurodivergent professionals already build their own AI tooling. There is a Claude Code skill pack for ADHD here, a hyperfocus output formatter there, a Mermaid-based visual organiser in a third repo, a multi-tier external memory system in a fourth. Every one of them is good. None of them compose. Every ND professional doing knowledge work is paying the same private integration tax, and the unmodified LLM at the centre of it all is actively unsafe for parts of this audience — sycophantic by default, time-blind, happy to fuel rumination loops and hyperfocus past any stated end-time. There is no shared cognitive substrate. NeuroDock is the attempt to build one.

## Substrate

The substrate is the layer that externalises executive function so the human does not have to hold it. Three MCP servers and a profile system. `mcp-chronometric` knows the time, the elapsed session, the prior intent, and when to call a break. `mcp-cognitive-graph` knows people, projects, decisions, and the audit trail behind each one, backed by local SQLite and `sqlite-vec`. `mcp-task-fractionator` decomposes a vague goal into 5–90 minute atomic tasks with acceptance criteria, and returns exactly one next action when asked. A profile at `~/.neurodock/profile.yaml` drives adaptation per user. Six launch skills sit on top: daily planning, context recovery, meeting translation, decision finality, hyperfocus formatting, and visual organisation. The user experience is "Claude that knows me", not "I installed twenty things."

## Communication

The second pillar is bidirectional corporate-communication translation. One browser extension (Manifest V3, WXT-built) and one MCP server (`mcp-translation`), sharing one prompt library and one versioned eval corpus. Selected text on Gmail, Slack, Linear, Notion, GitHub, Google Docs, or Outlook returns three things: the explicit ask, the likely subtext with a confidence flag, and the recommended next action. Outgoing tone gets a directness / warmth / urgency reading against thread baseline. Meeting transcripts come back as four sections: my asks, others' asks, decisions, ambiguous items. Local-only by default. Cloud mode requires explicit action and shows a persistent banner. The eval corpus is consented, anonymised, and versioned — every prompt change runs against it in CI.

## Clinical guardrails

The third pillar is the part most projects refuse to touch. Three detectors, all transparent, all overridable, all configured at setup rather than under duress. The rumination detector flags semantically-equivalent queries within a configured window and surfaces the reason; default is three queries in ninety minutes. The hyperfocus monitor escalates over 60 / 90 / 120 minutes and at the harder thresholds quotes the user's own stated end-time back at them verbatim. The sycophancy guard catches repeated reassurance-seeking and unconditional agreement on subjective questions, and injects a counter-prompt that asks the model to ground in prior evidence or refuse. Heuristics are public. False positives are logged and revised with a clinical advisory board of five practitioners on staggered terms. We never claim to treat any condition. We never block a user's action without their pre-configured consent.

## Built by, not for

NeuroDock is built by neurodivergent contributors using the very system being built. Lived experience is sufficient authority on artefacts targeted at a given neurotype — self-identification, no diagnosis gate. The maintainer council has five seats on two-year staggered terms, at least three reserved for lived-experience contributors. Maintainers can declare AFK with no questions asked. No package has fewer than two CODEOWNERS. Every release goes through a rotating lived-experience UAT pool. The contributor on-ramp targets fifteen minutes from zero to first PR.

## Local-first and AGPL

Two things are non-negotiable. The first is local-first: neurodivergent telemetry never leaves the user's machine without an explicit consent action per scope, embeddings default to local models, and the project ships with telemetry off. The second is AGPL-3.0 on the core packages. The combination is deliberate. Local-first prevents the substrate from becoming a surveillance product. AGPL prevents anyone — including a future version of us — from quietly closing what gets built. The eval corpus is licensed separately under a consented-data licence; the curation rules are public.

## Where to look and how to participate

The full plan lives in the planning bundle at `plan.md`. The RFC issue, "RFC: Founding scope and architecture", is open now. Anything is welcome: a single-line objection, a long-form alternative, a "I will build skill X", a "I will advise on Y", or a direct "this is wrong, here is why". Direct disagreement is preferred over polite hedging.

Phase 0 closes in about four weeks. The council meets at the end of week 4 to consolidate responses and decide what merges, what changes, and what gets deferred. If this is the project you have been waiting for, or the project you have been quietly building pieces of in private, this is the door.
