# 0003 — Task fractionator tool design (mcp-task-fractionator v0.1.0)

- **Status:** accepted
- **Date:** 2026-05-15
- **Deciders:** maintainer (TBD), `mcp-architect`
- **Consulted:** `mcp-server-builder`, `skill-author` (for the daily-planner and `/resume` consumers)
- **Informed:** (no clinical surface in v0.1.0 but Phase 2 may add chronometric-aware nudging), `doc-writer`, `accessibility-auditor`

## Context

`mcp-task-fractionator` is the third substrate server scheduled for Phase 1 (), shipping alongside `mcp-chronometric` and `mcp-cognitive-graph` in the `v0.1` developer preview. It supports the user stories in , most directly the "Director with ADHD" story: _"voice-dump a vague initiative and get back 7 atomic tasks plus the single next one"_ — with the acceptance bar that 80%+ of pilots rate the output "I can start now".

The server provides two tools:

- `decompose(goal, time_budget?)` — vague goal in, atomic 5–90 minute tasks out, with explicit acceptance criteria, dependency edges, and a total ordering.
- `next_one(project)` — one task out, with reasoning and a confidence number.

This ADR sits on top of the precedent established by ADR 0001 (`0001-chronometric-tool-design.md`): small tools, server-side state, enums for coarse signals, ISO 8601 durations everywhere, additive-only evolution within `v0.1.x`. Conventions inherited from there are not re-litigated here.

## Decision drivers

1. **ADHD-friendly atomic granularity.** Tasks must be small enough that a user with executive-function load can pick them up cold. The 5–90 minute estimated range, the 3–12 target count (hard cap 20), and the requirement that every task carry at least one acceptance criterion all encode this.
2. **Stateless server in v0.1.0.** Persistence already has a home (`mcp-cognitive-graph`); duplicating it inside the fractionator would couple two servers and split the source of truth.
3. **No LLM call from inside the server.** Per the LLM boundary is the user's MCP client. The substrate servers do not embed model calls. This is a vendor-neutrality property and a privacy property.
4. **Additive-only evolution.** Same versioning policy as the chronometric server. The `v0.1.0` `$id` is part of the contract.
5. **No vendor lock-in.** No assumption about which LLM client invokes these tools. No assumption about which storage backend mcp-cognitive-graph is using underneath.
6. **Composition is the manifesto.** A `plan` tool that combines decompose+next would be cheaper to call but would conflate two responsibilities and prevent skills from interposing between them (e.g. running a clarification step on the decomposition before committing to a single next step).

## Considered options

### Option A — Stateful server with built-in persistence

A single server that owns tasks end-to-end: `decompose` writes to a local SQLite table, `next_one` reads from it, plus `mark_done`, `list_pending`, etc.

**Rejected because:**

- Duplicates `mcp-cognitive-graph`, which already owns persistent entity state for the substrate. Two servers writing tasks creates two sources of truth that drift.
- Couples skill authors to two separate persistence APIs depending on whether the entity is "a task" or "a fact". Skills should not have to know that distinction.
- Increases the surface area of the v0.1.0 server. More tools means more schemas to version, more failure modes, slower path to a green release.
- Violates "composable over monolithic" ( principle 4) — fractionator and cognitive-graph become hard to swap independently.

### Option B — Stateless server with cognitive-graph persistence (chosen)

`decompose` returns the task list as data. `next_one` reads from `mcp-cognitive-graph` (which the caller — usually a skill — wrote to between the two calls). The fractionator owns the _decomposition algorithm_; the graph owns the _state_.

### Option C — A single combined `plan` tool

One tool: input a goal, output `{tasks, next}`. One round trip, no separate `next_one`.

**Rejected because:**

- Conflates two distinct responsibilities (carving a goal versus picking the next step from existing state). A user asking "what's next on the RFC?" should not require re-running decomposition.
- Forces every caller into the same flow. The "morning brief" skill wants `next_one` against multiple projects without re-decomposing any of them.
- Composition is the manifesto. Skills should be able to interpose between decompose and next-pick — e.g. an `ocd-decision-finalizer` skill might run between the two to confirm acceptance criteria with the user.

## Decision

We adopt **Option B**, with the two tools as specified in:

- `packages/mcp-task-fractionator/schemas/decompose.schema.json`
- `packages/mcp-task-fractionator/schemas/next_one.schema.json`

The seven binding design decisions:

### 1. Statelessness in v0.1.0

`decompose` is stateless. It returns a task list but does NOT persist it. Persistence is the caller's responsibility, via `mcp-cognitive-graph`:

- Each task becomes an entity (`record_fact` with the task id as subject, `acceptance_criteria`, `estimated_minutes`, etc. as facts).
- Each dependency becomes a fact with `predicate == "depends_on"`, subject = dependent task id, object = blocker task id.
- The project becomes an entity that owns the tasks via `predicate == "part_of"`.

`next_one` reads from `mcp-cognitive-graph` to find pending tasks under the named project. The fractionator never persists; the graph never decomposes.

**Consequence for `skill-sdk`:** the common "decompose then write" path is two server calls plus several `record_fact` calls. We will publish a helper — `skill_sdk.fractionator.decompose_and_persist(goal, project, time_budget?)` — that makes this a one-liner. The helper lives in `@neurodock/skill-sdk` and `neurodock-skill`, not in the server.

### 2. No LLM call from inside the server

Like `mcp-cognitive-graph`, this server does not call an LLM directly. v0.1.0 uses local templating and heuristics for decomposition. The LLM boundary stays at the user's MCP client.

The richer-decomposition path is a v0.2 tool, _not_ a v0.1 hidden upgrade:

- **Provisional name:** `decompose_with_assist(goal, llm_draft, time_budget?)`. The LLM produces a draft decomposition client-side and submits it; the server validates the schema, fills in UUIDs, topologically sorts, checks budget feasibility, and rejects malformed or unsafe drafts. The server remains the schema and invariants authority; the LLM is a content provider.
- This separation keeps vendor-neutrality intact and keeps the "no remote calls from the server" property auditable.

### 3. `time_budget` parsing

ISO 8601 durations only, validated with the same regex used by the chronometric durations:

```
^P(?!$)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$
```

Examples that parse: `PT4H`, `P3D`, `PT30M`, `PT2H30M`. `P3D` is treated as 3 working blocks of profile-declared length (default 4 hours each) — this lets a user say "I have three days" without the server pretending they will work 72 consecutive hours. Days-to-minutes conversion is a server-internal heuristic and may evolve; the _schema_ commits only to the duration format.

Unparseable input returns `TIME_BUDGET_UNPARSEABLE`. The server does NOT silently fall back to unbounded, because that would mask caller bugs.

### 4. Acceptance criteria are required

Every task in every response has at least one acceptance criterion. The schema enforces `minItems: 1` and the server enforces `ACCEPTANCE_CRITERIA_REQUIRED` as a correctness invariant.

This is a manifesto-aligned choice. ADHD-prone users need explicit done-conditions to avoid open-loop drift; "Answer First" formatting is undermined if "done" is undefined. A task without acceptance criteria is not atomic, by definition.

### 5. Dependency cycles are an error

The server topologically sorts the dependency graph. Any cycle returns `DEPENDENCY_CYCLE`. This is treated as a server bug (the local heuristic engine should never produce one), surfaced as an explicit error rather than papered over.

Cross-response dependencies (referencing a task from a previous `decompose` call) are NOT modelled in the response — those edges belong in `mcp-cognitive-graph`. This keeps each `decompose` response self-contained and validate-able in isolation.

### 6. `sequence` is total order, not just topological

Two parallel tasks at the same topological depth still receive distinct `sequence` numbers. The server picks one (currently: stable sort by `estimated_minutes` ascending then by task id, but this is a server-internal detail). Callers MAY re-order client-side; the contract is only that the sequence numbers are distinct integers starting at 1.

This makes `next_one` trivially definable as "sequence = 1 of the unfinished subset", which is what the v0.1.0 implementation does.

### 7. Privacy

- No remote calls. All processing local.
- Goal text and project name are sensitive (they reveal user goals and current state).
- Goal text MUST NEVER be logged — not at info, not at debug, not in error payloads. Validation errors reference field names, not content.
- The privacy boundary is identical to `mcp-chronometric`'s `intent` field handling per ADR 0001.

## Consequences

### Positive

- **Clear separation of concerns.** Fractionator carves; graph remembers. Each server is testable in isolation. Each schema is small.
- **Composes cleanly with cognitive-graph and skills.** Skills can interpose between decompose and next-pick. Skills can mutate the graph (mark tasks done, edit acceptance criteria) without going through the fractionator.
- **Vendor-neutral.** No LLM call inside the server means no vendor coupling at the server layer.
- **Auditable.** Local heuristic decomposition can be inspected; there is no opaque model output to explain.
- **Sets the third precedent.** Together with ADRs 0001 and 0002 (cognitive-graph, forthcoming) this completes the substrate-server design vocabulary: small tools, server-side state where natural, no embedded LLM calls, additive-only evolution.

### Negative

- **Caller responsibility for persistence.** Without the skill-sdk helper, the "decompose then write" path is several calls. Mitigation: ship the `decompose_and_persist` helper in `@neurodock/skill-sdk` and `neurodock-skill` so the common case is one line for skill authors.
- **Local heuristic quality is bounded.** Without an LLM in the loop, v0.1.0 decomposition for vague goals will be cruder than what a model could produce. Mitigation: surface `DECOMPOSITION_UNAVAILABLE` with a clarifying question rather than fabricating a poor decomposition; document the v0.2 `decompose_with_assist` path so users know richer output is coming.
- **No "next-few" tool.** Users wanting a peek at the next 3 tasks must call `decompose` and read its tasks array. Acceptable: `next_one` deliberately enforces single-answer ergonomics for ADHD-prone callers. A future `next_few` tool, if proposed, would be a new tool — not a parameter on this one.
- **No cross-server transactionality.** A caller that runs `decompose` and then partially fails while writing to `mcp-cognitive-graph` produces an orphaned task list. Mitigation: the skill-sdk helper SHOULD write atomically (single transaction in `record_fact` batched form) once the graph server supports it. Out of scope for this ADR.

## Open questions

1. **How does the v0.1.0 heuristic decomposition handle vague goals?** The current plan is a local templating + keyword heuristic engine: it recognises verbs (`ship`, `fix`, `draft`, `set up`), nouns (`RFC`, `bug`, `feature`), and time markers (`by Friday`, `before the demo`) and maps them to small task skeletons. For genuinely vague input (e.g. `"do the thing"`) the server returns `DECOMPOSITION_UNAVAILABLE` with a `clarifying_question` field — _not_ a fabricated decomposition. Open: should the clarifying-question generator itself live in the server, or should it be a skill-side concern fed from a small static table the server returns? Recommended: server returns one canned question per detected ambiguity class; richer clarification is a skill responsibility.

2. **Should `next_one` consider chronometric `energy_zone` in its choice?** A 60-minute writing task is a worse pick at 4pm `afternoon_dip` than a 15-minute coordination task. v0.1.0 ignores energy zone (purely sequence-based) to keep the dependency graph between substrate servers shallow. Phase 2 enhancement: `next_one` reads `get_time_context()` and weights candidates by tag/energy fit. This would be additive (an optional output field `energy_zone_match: float`); the input schema would not change. Maintainer to confirm before Phase 2 work begins.

3. **How does `BUDGET_INFEASIBLE` carry partial progress back to the caller?** When the server cannot fit a decomposition under `time_budget`, it currently returns the error code only. Two options:

   - **Strict:** error payload contains `minimum_feasible_minutes` only; the caller retries with a larger budget.
   - **Generous:** error payload contains a draft decomposition that _would_ fit if the budget were relaxed, plus `minimum_feasible_minutes`.

   The generous option is more useful to ADHD-prone users (they see the shape of the work, not just a refusal) but risks the caller treating the draft as authoritative. Recommended: strict for v0.1.0; revisit after the first cycle. The schema is forward-compatible with either choice because errors carry payloads that are not strictly schematised in v0.1.0.

## Notes for `mcp-server-builder`

- Both schemas are at `packages/mcp-task-fractionator/schemas/*.schema.json` and are the source of truth. Generated Python types SHOULD be derived from these (e.g. via `datamodel-code-generator`) rather than hand-written, matching the pattern set in ADR 0001.
- The Task object shape is repeated in both schemas (self-contained per architect convention) but the implementation SHOULD share a single Python/TS type behind the scenes.
- The `decompose_and_persist` skill-sdk helper is owned by `skill-author`, not the server. Coordinate when the helper is being designed so the dependency-edge predicate names (`depends_on`, `part_of`) stay consistent with `mcp-cognitive-graph`'s vocabulary.
- Goal text logging is a hard correctness property. A regression that logs goal content is a CRITICAL severity issue under `code-review` rules, identical to the consent-gate property on `mcp-chronometric.idle_status`.
