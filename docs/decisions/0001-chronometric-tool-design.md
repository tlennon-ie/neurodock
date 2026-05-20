# 0001 — Chronometric tool design

- **Status:** proposed
- **Date:** 2026-05-15
- **Deciders:** maintainer (TBD), `mcp-architect`
- **Consulted:** `mcp-server-builder`, (pre-review for consent semantics on `idle_status`)
- **Informed:** `skill-author`, `accessibility-auditor`, `doc-writer`

## Context

`mcp-chronometric` is the first MCP server NeuroDock will ship. Per it is the only MCP package committed for the Phase 0 → Phase 1 transition, and per §15 Week 2 the `mcp-server-builder` agent is expected to start implementation as soon as schemas exist. It is therefore the precedent-setting design for every later substrate server (`mcp-cognitive-graph`, `mcp-task-fractionator`, `mcp-translation`, `mcp-guardrail`). Decisions made here propagate.

The substrate's value to neurodivergent users depends on externalising executive function — time awareness, session framing, hyperfocus interruption, idle vs distraction discrimination — without requiring the LLM to maintain that state across turns. The tools must therefore be:

- callable in isolation, with no required prior call other than `mark_session_start`;
- stateful **inside the server**, never in the prompt;
- consent-gated where they reach beyond the substrate (notably OS idle);
- structured so that downstream skills can quote the user's own words back rather than improvising scolding text.

## Decision drivers

1. **Low-friction install.** Every additional tool the user (or their MCP client) has to wire up reduces adoption. We prefer the smallest credible tool set.
2. **Profile-driven thresholds.** Hyperfocus break minutes, end-of-day cutoff, idle consent — all live in `~/.neurodock/profile.yaml` (§6). Tools must read from there rather than re-asking the LLM.
3. **Local-first.** No remote calls. No telemetry. Idle status is the strictest test of this.
4. **Vendor-neutral.** No assumptions about the MCP client's capabilities beyond standard tool-call semantics.
5. **Quotability.** Skills like the hyperfocus nudge (§8 "PM with ADHD" story) need the user's verbatim intent. The session model must preserve it.
6. **Auditability.** Detection heuristics are public (per ETHICS framework §8). `energy_zone` and `hyperfocus_signal` must be coarse, documented enums, not black-box scores.

## Considered options

### Option A — One large `get_status` tool

A single tool returning current time, day, session state, break warning, idle status, and energy zone in one shot. One round trip; minimal surface area.

**Rejected because:**

- Consent gating becomes muddled. OS idle requires explicit user consent; bundling it with always-safe fields like `now` either contaminates the always-safe path with consent prompts, or silently downgrades `idle_status` to null without making that visible to skill authors.
- Side effects mix with reads. `mark_session_start` mutates state; `get_time_context` does not. A single tool collapses that distinction.
- Versioning is brittle. Any change to any sub-field requires either a major bump or a structural change to the giant return type. The "convenience parameter that mixes concepts" failure mode from `.claude/agents/mcp-architect.md`.
- LLM prompting suffers. A tool description that ends with "returns time, session, break recommendation, and idle status (consent-gated)" is harder for the model to invoke correctly than five tools with one job each.

### Option B — Five-tool decomposition (chosen)

One tool per single responsibility: read time context, start session, end session, check break, check idle. Each independently versioned, independently testable, independently mockable. State (`session_id`, `prior_intent`, last-prompt-at) lives in the server.

### Option C — Streaming-only event subscription

The server publishes time/session/idle events; clients subscribe. No request/response.

**Rejected because:**

- MCP support for streaming subscriptions across clients is inconsistent in 2026. Vendor-neutrality (§3) requires we work against the lowest common denominator.
- Skills are request-shaped. `adhd-daily-planner` runs at user-trigger time, not on a clock. Forcing skill authors to consume an event bus would raise the contribution bar.
- Local-first observability becomes harder. Tool calls are auditable by any MCP-aware client; subscription channels often are not.

## Decision

We adopt **Option B: the five-tool decomposition** as specified in the five schema files under `packages/mcp-chronometric/schemas/`.

### Cross-cutting design choices that bind future servers

1. **Time fields are ISO 8601 with explicit timezone.** No naive timestamps anywhere in the substrate.
2. **Durations are ISO 8601 strings**, not integer-seconds, to make units self-describing and to keep the door open for sub-second precision later.
3. **Session ids are UUIDv4 strings**, format-validated by JSON Schema, returned by `mark_session_start` and `mark_session_end` only. They are NEVER passed back into the server as inputs — that would force the LLM to maintain state.
4. **Enums for coarse signals, not floats.** `energy_zone`, `suggested_action`, `hyperfocus_signal` are enums. Skills can render them however they want.
5. **Consent failures are not exceptions.** `idle_status` with no consent returns a successful result with `consent_granted: false` and `hyperfocus_signal: "unknown"`. This matches the manifesto principle that the system never blocks silently.
6. **`null` is a first-class return.** `request_break_if_needed` returns `null` when no break is warranted; callers MUST handle it. This is preferable to a boolean flag + ignorable payload.

### Energy zone heuristic (initial)

For v0.1.0, `energy_zone` is computed as a heuristic over local clock time, with profile-declared adjustments:

| Local hour (24h) | Default zone        |
| ---------------- | ------------------- |
| 05:00–08:59      | `morning_peak`      |
| 09:00–11:59      | `morning_peak`      |
| 12:00–13:59      | `midday`            |
| 14:00–16:29      | `afternoon_dip`     |
| 16:30–19:29      | `evening_quiet`     |
| 19:30–04:59      | `night_owl_caution` |

A profile entry under `chronometric.zones` MAY override these bands; an unparseable profile yields `unknown` rather than failing the call. The heuristic is intentionally crude — refinement is an open question, below.

### Versioning rules (binding on the substrate)

- The `$id` of each schema includes `v0.1.0`. Patch and minor bumps within the v0.1.x line MUST be additive-only.
- Renaming a tool, retyping a field, removing an enum value, or making an optional input required is a major bump and ships under a new `$id` path (`/v1.0.0/...`).
- The deliberate omission of inputs (e.g. `mark_session_end` taking no `session_id`) is itself part of the contract. Adding such an input later is a breaking change, not an addition.

## Consequences

### Positive

- **Single responsibility per tool.** Each schema is small enough that an LLM can reliably pick the right one. Each is easy to mock in tests.
- **Independent versioning.** A future field on `get_time_context` does not force a redeploy of `idle_status`.
- **Consent isolation.** `idle_status` is the only tool that touches the consent boundary; the other four are unconditionally safe to call. Clinical review () scope is correspondingly narrow.
- **Auditable signals.** Coarse enums make every nudge explainable. "Why did this break suggestion fire" is answerable from tool outputs alone.
- **Sets a precedent.** The same shape — small tools, enums for coarse signals, server-side state, profile-driven thresholds — will be reused by the four remaining substrate servers.

### Negative

- **More round trips for a single dashboard view.** A "morning brief" skill that wants time + session + break + idle pays four tool calls instead of one. Mitigation: skills SHOULD batch these client-side and cache for the duration of a single user turn; we will publish a `chronometric-snapshot` helper in `@neurodock/skill-sdk` that does the batching with documented staleness bounds. We will NOT add a server-side aggregate tool, because doing so reintroduces Option A's problems.
- **Possible duplication in error handling.** Each tool re-declares its own error code table. Mitigated by referencing a shared error vocabulary doc once it exists; cross-server consistency is an explicit `mcp-architect` responsibility.
- **No `session_id` input parameter on `mark_session_end`.** This means a misbehaving client cannot close an arbitrary session — only the most recent open one. Acceptable trade-off; revisit only if multi-session-per-user becomes a real requirement (it is not in Phase 1).

## Open questions

1. **How is `energy_zone` computed?** v0.1.0 uses the static clock-band heuristic above. Three credible refinements:

   - **profile-declared:** the user names their own zones in YAML;
   - **adaptive heuristic:** a rolling 30-day model of session productivity (requires storage we do not yet have);
   - **ML-derived:** clustering over local session telemetry, opt-in only.

   The v0.1.0 schema is forward-compatible with any of these because `energy_zone` is an enum whose computation is server-internal. The decision can be deferred. Recommended: ship clock-band heuristic; let `profile-declared` overrides land in v0.1.x; defer adaptive and ML to a later RFC.

2. **How is OS-idle consent surfaced?** The schema requires `profile.privacy.os_idle_consent`. Open: should the CLI `npx neurodock init` flow ask for it at install time (one-shot, easy to dismiss thoughtlessly) or defer until the user first installs a skill that requests `idle_status` (just-in-time, friction at a useful moment)? Recommended: just-in-time, but require the `mcp-server-builder` to emit a structured "consent missing" log line when `idle_status` is called without consent, so the omission is visible.

3. **Should `mark_session_start` auto-close a prior unterminated session, or error?** The schema supports both via the optional `auto_closed_prior_session` output field and the `SESSION_ALREADY_OPEN` error code. Two clean positions:

   - **Auto-close:** charitable to ADHD users who forget; risk of swallowing real intent.
   - **Error:** forces the user to confront the orphan session; risk of friction at the worst possible moment.

   Recommended: **auto-close by default, with the prior session metadata returned in the response** so skills can surface "you didn't close your last session; here's what it was". Configurable via `chronometric.session_overlap_policy` in the profile. Maintainer to confirm before `mcp-server-builder` implements.

4. **`request_break_if_needed` threshold source.** The schema requires the caller to pass `threshold_minutes` rather than reading it from the profile. This was deliberate (one tool, one job; profiles read by the caller, not by every tool). Open question: do we instead want a `profile_threshold: true` shortcut that the server resolves? Recommended: no, keep the responsibility with the caller; document the profile path clearly in skill-sdk so this is a one-liner there.

## Notes for `mcp-server-builder`

- All five schemas are at `packages/mcp-chronometric/schemas/*.schema.json` and are the source of truth. Generated Python types SHOULD be derived from these (e.g. via `datamodel-code-generator`) rather than hand-written.
- The session model requires durable-enough local storage to survive a process restart within reason. SQLite (per §4) is the substrate's standard; an in-memory shim is acceptable for v0.0.x prototyping but not for v0.1.0.
- Treat the consent gate on `idle_status` as a hard correctness property covered by tests. A regression here is a CRITICAL severity issue under `code-review` rules.
