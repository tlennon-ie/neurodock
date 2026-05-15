# 0002 — Cognitive graph tool design (mcp-cognitive-graph v0.1.0)

- **Status:** proposed
- **Date:** 2026-05-15
- **Deciders:** Maintainer council (TBD), `mcp-architect`
- **Consulted:** `mcp-server-builder`, `skill-author` (consumer of `recall_entity` and `recall_decisions` from `audhd-context-recovery` and `adhd-daily-planner`)
- **Informed:** `clinical-reviewer`, `accessibility-auditor`, `doc-writer`, `eval-curator`

## Context

`mcp-cognitive-graph` is the second MCP server NeuroDock will ship and the persistence backbone of the substrate. Per `plan.md` §11 it lands inside Phase 1 alongside `mcp-chronometric`; per §6 it provides four tools (`recall_entity`, `record_fact`, `recall_decisions`, `weekly_rollup`) that together externalise the user's working memory of people, projects, decisions, and concepts. Per §15 Week 3+ it is the substrate dependency that `audhd-context-recovery` (the `/resume` skill) and the Monday-morning brief in `adhd-daily-planner` both rely on, and it is a substrate dependency for `asd-meeting-translator` in Phase 2.

The cognitive graph's value is that it lets a neurodivergent user offload "who said what about which decision when" into a store they own, queried by name rather than by structured key. The schemas must therefore be:

- forgiving on input (alias-match the user's wording);
- strict on output (no free-form blobs; every fact has a typed shape);
- additive-only as the vocabulary grows;
- local-first with no implicit remote fetches, even of stored source URLs;
- callable in isolation with no required prior call (no LLM-maintained state).

ADR 0001 set the precedent for cross-cutting design — ISO 8601 with offsets, enums for coarse signals, server-side state, profile-driven thresholds, structured errors. This ADR adopts those rules and extends them with graph-specific decisions.

## Decision drivers

1. **Local-first.** All four tools read or write only the local SQLite + sqlite-vec store. No remote calls, no implicit fetches of stored source URLs.
2. **Low-friction recall.** A user typing "kipi" should retrieve "kipi-system". Resolution is the server's job, not the caller's.
3. **Additive-only schema evolution.** The controlled vocabulary will grow; we must not require a major bump every time a new predicate is added.
4. **Vendor-neutral storage.** The schema is independent of storage choice; SQLite + sqlite-vec is the v0.1.0 substrate but the contract does not encode it.
5. **Vendor boundary discipline.** The cognitive graph server does not call an LLM. The user's MCP client is the only LLM boundary in the substrate, per §3.
6. **Quotability.** Skills like `audhd-context-recovery` need to surface decisions, blockers, and sources verbatim. The output shape preserves that.

## Considered options

### Option A — Strict RDF triples

Treat every fact as a (subject, predicate, object) IRI triple, with subject and object both required to be entity IRIs and predicate drawn from a published ontology.

**Rejected because:**

- Forces every value-typed fact (a tag, a status, a free-text note) to become its own entity. The user-facing UX of "tag kipi-system as external-memory" becomes a two-step entity creation.
- IRIs as a public surface leak ontology choices into skill authors' code. A skill should call `record_fact({type:"project", name:"kipi-system"}, "tagged", {literal:"external-memory"})`, not construct an IRI.
- Tooling overhead (SPARQL-ish concerns, OWL alignment) is wrong for a local-first ND substrate.
- The ND user community is not asking for RDF; they are asking for "find what I said about Roberto".

### Option B — Typed-edge property graph (chosen)

A fact is (subject, predicate, object) where subject is `{type, id|name}`, predicate is a controlled-vocabulary enum, and object is either an entity reference or a literal. Entities have a small fixed type taxonomy in v0.1.0 with a documented extension path.

### Option C — Full-text only, no structure

Store every "fact" as a free-text note keyed to an entity. Recall via embedding search alone.

**Rejected because:**

- Loses the ability to answer "what decisions were made on neurodock since 2026-05-01" without round-tripping through an LLM.
- Makes `weekly_rollup` impossible to template locally; we would have to call an LLM inside the server, violating the vendor boundary.
- Conflates "what we know" with "where we saw it"; collapses the source/confidence metadata.

### Option D — One giant `query` tool

Single tool that takes a query DSL or natural-language query and returns whatever shape the server decides.

**Rejected because:**

- "Convenience parameters that mix concepts" — the failure mode `.claude/agents/mcp-architect.md` warns against. The four uses (recall entity, record fact, recall decisions, weekly rollup) have genuinely different semantics, side-effect profiles, and output shapes.
- LLM-side, a single overloaded tool is harder to invoke correctly than four single-purpose tools with one-sentence descriptions.
- Versioning is brittle: any change to any branch of the DSL is a structural change.

## Decision

We adopt **Option B: the typed-edge property graph** as specified in the four schema files under `packages/mcp-cognitive-graph/schemas/`.

### 1. Entity type taxonomy (v0.1.0)

The v0.1.0 taxonomy is the closed set `person | project | decision | concept | source`. This is the smallest set that covers the launch skills:

- `person` — colleagues, mentors, advisors;
- `project` — work units the user tracks (e.g. `neurodock`, `kipi-system`);
- `decision` — distinct commitments whose history the user wants;
- `concept` — tags, technologies, ideas without further structure (e.g. `sqlite-vec`);
- `source` — first-class citations when the user wants to anchor facts to a document or thread rather than embed source as a string.

A `type_extensions` mechanism is **deferred to v0.2**. The forward-compatibility position is: new types ship under v0.2 via the extension mechanism, not by mutating the v0.1.0 enum. v0.1.0 clients seeing a v0.2 extension-typed entity will simply not match it; this is acceptable for the deferral.

### 2. Fact shape — typed-edge, not RDF

A fact is `{subject: EntityRef, predicate: enum, object: EntityRef|Literal, source?, confidence?}`.

- `subject` is `{type, id|name}`. Either `id` or `name` is sufficient; `(type, name)` upserts.
- `predicate` is the v0.1.0 controlled vocabulary:
  - `mentioned_in` — subject was mentioned in object (object is typically a `source`);
  - `decided_in` — subject (person/project) was the decider for object (a `decision`);
  - `reports_to` — subject (person) reports to object (person);
  - `depends_on` — subject depends on object;
  - `resolved_by` — subject was resolved by object;
  - `blocked_by` — subject is blocked by object;
  - `tagged` — subject is tagged with object (object is typically a literal);
  - `belongs_to` — subject belongs to object (e.g. concept belongs_to project).
- `object` is either an `EntityRef` or `{literal: string}`. Literals exist precisely so we do not have to coin an entity for every tag, status, or short note.

Adding a new predicate is **a major bump** in v0.1.x, deliberately, because skills will branch on predicate values; silently expanding the enum would break those branches. The intent is to bundle predicate additions into v0.2 via the same `type_extensions` mechanism.

### 3. `source` and `confidence` semantics

- `source` is optional free-text. It is a URL, a message id, a transcript citation, or any other origin marker. **Stored verbatim, never fetched.** The cognitive graph server does not have network access.
- `confidence` is an optional float in `[0, 1]` and defaults to `1.0` (declarative). Skills that record inferred facts SHOULD lower it; the field exists for future ranking and for surfacing uncertainty.

### 4. `recall_entity` output shape

Returns `{entity, facts, related_entities, resolution, truncated_facts}`:

- `entity` is the resolved entity record or `null` when no alias-match crosses threshold. Null is a first-class return; skills MUST handle it.
- `facts` are all facts touching this entity (as subject or object), ordered by `recorded_at` descending. Hard cap of 500 with a `truncated_facts` flag.
- `related_entities` are first-degree neighbours, ordered by `co_occurrence_count desc`, capped at 20 to keep the output scannable for a hyperfocused user.
- `resolution` is `{method, score}` — diagnostic, so skills can say "I think you meant X" when method is `fuzzy` or `embedding`.

### 5. `recall_decisions` semantics

A "decision" is either a fact whose `predicate == "decided_in"` OR an entity whose `type == "decision"`. The server unions both. Output is `Decision[]` ordered by `decided_on` desc, capped at 200, with a `truncated` flag. `since` is an ISO 8601 calendar date (date-only, not date-time) because the question "what did we decide this week" is intrinsically local-day, not instant-of-time. Pagination is reserved for a future minor version.

### 6. `weekly_rollup` shape

Returns `{project, period, summary, decisions, blockers, next_actions, generated_at}`:

- `period` is a fixed seven-day window ending today. Configurable window is reserved for a future minor version.
- `summary` is rendered by a **local template engine** inside the server. It contains no LLM output. This is the explicit vendor-boundary call: the cognitive graph server does not call an LLM. Richer narrative rollups are a Phase 2 enhancement, delivered by skills that themselves invoke the user's MCP client LLM with the structured `decisions`/`blockers`/`next_actions` payload.
- `decisions` and `blockers` are typed arrays (Decision and Fact respectively). `next_actions` is a small array of templated strings.
- A future additive `narrative` output field MAY be added when LLM rollups become available; the `summary` field remains the local-template fallback.

### 7. Storage substrate

Per `plan.md` §4, the v0.1.0 store is **SQLite + sqlite-vec**, with embeddings via local Ollama (default `nomic-embed-text-v1.5`) or `fastembed-py` (`gte-small`). The relational tables hold entities, aliases, and facts; the vector index holds entity-name embeddings (for alias resolution) and decision-summary embeddings (for semantic decision search). SQLCipher is the opt-in at-rest encryption layer when the user requests it.

**The schemas are storage-agnostic.** This decision is recorded here for `mcp-server-builder` and not encoded in the JSON Schema. A future swap (e.g. DuckDB, a property-graph engine) is permitted so long as the contract is preserved.

### 8. Vector recall is NOT a separate tool in v0.1.0

We deliberately do not ship `semantic_search(query)` or `find_similar(entity)` as v0.1.0 tools. Vector recall is an **internal implementation detail** of `recall_entity` (which uses embedding similarity for alias resolution when exact and fuzzy match fail) and `recall_decisions` (which uses summary embeddings to disambiguate decisions with overlapping names).

**Rationale:**

- The four-tool surface matches the user-facing concepts. A `semantic_search` tool is a mechanism, not a use case. Skills don't need it because every legitimate use is already covered by a typed recall.
- Exposing a raw vector tool would tempt skill authors to use it as a god-tool, recreating Option D.
- If a real use case emerges (e.g. "find decisions semantically similar to this draft RFC"), it ships as a new typed recall in a later minor version (`recall_similar_decisions(text)`), not as a generic search primitive.

### 9. Privacy and consent

- All four tools read or write only the local SQLite + sqlite-vec store.
- No remote calls. No telemetry. No implicit fetches of stored source URLs.
- `source` URLs are returned verbatim to callers; the caller may choose to render them, but this server will not fetch them.
- The cognitive graph's contents are sensitive (entity names, decision titles, blocker text reveal user goals and frustrations). The server stores them locally and treats them as user-private. There is no consent gate at tool-call time — the gate is at install time, when the user opted into a local-first substrate. This matches the `mcp-chronometric` baseline; the consent boundary in this server is _absence of network_, not a per-call prompt.

### Cross-cutting alignment with ADR 0001

- ISO 8601 with explicit offsets for all `*_at` fields. Date-only (no time) for `decided_on` and `since`.
- Enums for coarse classifications (`type`, `predicate`, `resolution.method`).
- Errors are structured codes with prose descriptions, never silent.
- `null` is a first-class return for "no match" cases; callers MUST handle it.
- Schemas are versioned via `$id` path; v0.1.x is additive-only.

## Consequences

### Positive

- **Single-responsibility tools.** Four tools that map one-to-one with user-facing concepts. Each is small enough to mock and small enough for the LLM to choose correctly.
- **SQLite + sqlite-vec composes cleanly.** Relational facts + vector alias resolution in one file. No second daemon to run.
- **Backward-compatible field additions.** New optional output fields (e.g. `narrative` on `weekly_rollup`) ship as minor bumps without breaking v0.1.0 clients.
- **Auditable.** Every fact has a `source` slot and a `confidence` slot. Every recall returns the resolution method and score. Skills can surface "I'm guessing, here's why."
- **Vendor boundary clean.** No LLM call inside the server. Phase 2 LLM rollups happen on the caller side.

### Negative

- **Controlled vocab will grow.** Eight predicates and five entity types is not enough for every use case. Each addition is a major bump under the current rule, batched into v0.2 via `type_extensions`. The risk is contention on what makes the v0.2 cut.
- **Extension points needed by Phase 2.** `type_extensions`, paginated `recall_decisions`, configurable `weekly_rollup` window, and `narrative` output are all foreseeable v0.1.x or v0.2 additions. The schemas are ready for them but the spec work is deferred.
- **No raw semantic search.** Skills that want "find me decisions vaguely like this" cannot do it in v0.1.0 except indirectly via alias-matching. We will reassess after Phase 1.
- **Dedup policy is server-internal.** `record_fact` returns a `deduplicated` flag but the exact dedup strategy is not in the schema. Skill authors who rely on dedup semantics will need to read the server docs, not just the contract. This is the smallest version of the open question below.

## Open questions

1. **Alias-matching strategy in `recall_entity`.** v0.1.0 promises four resolution methods (`exact`, `alias`, `fuzzy`, `embedding`) but does not pin thresholds. Three credible positions:
   - **Conservative:** require ≥ 0.85 cosine similarity for embedding matches; fall back to `none` otherwise. Lower false-positive rate; risk that "Rob" doesn't match "Roberto" until an explicit alias is recorded.
   - **Liberal:** ≥ 0.65 cosine; rely on the `resolution.score` field to let skills decide whether to confirm.
   - **Profile-declared:** thresholds live in `~/.neurodock/profile.yaml` under `cognitive_graph.alias_threshold`.

   Recommended: ship conservative defaults in v0.1.0, add profile override in v0.1.x, defer adaptive thresholds.

2. **`record_fact` deduplication semantics.** When the same `(subject, predicate, object)` triple is recorded twice with different `source` or `confidence`, what happens?
   - **Last-write-wins on source/confidence**, single row in storage. Simplest; loses provenance.
   - **Append-only with a logical-fact id**, where `fact_id` returned is the canonical row and `deduplicated: true` signals that a new source/confidence was merged onto it. Preserves provenance; more storage.
   - **Always insert**, accept duplicates, let `recall_entity` collapse them at read time.

   Recommended: option 2 — append-only with logical-fact ids — because losing provenance is the worse failure for a memory substrate. Council to confirm before `mcp-server-builder` implements.

3. **`weekly_rollup` `next_actions` without an LLM.** v0.1.0 templates `next_actions` from open blockers, decisions lacking follow-up, and `tagged` facts with value `next-action`. This is heuristic and will produce dull suggestions. Three positions:
   - **Keep the heuristic and label it as such** in the field description; richer suggestions are explicitly a Phase 2 LLM-on-the-caller-side enhancement.
   - **Drop `next_actions` from v0.1.0 entirely** and add it back when LLM rollups land.
   - **Allow the caller to pass a `next_action_strategy` enum** and select between templates.

   Recommended: option 1 (keep the heuristic, label it). The Phase 2 narrative field will add the LLM-quality version without breaking the v0.1.0 contract.

## Cross-cutting concerns for the council

- **The predicate enum is a public commitment.** Once shipped, the eight-predicate list is harder to change than the entity-type list (skills will branch on predicate values). The council should weigh in on the seed list before v0.1.0 tags.
- **The `type_extensions` mechanism does not yet exist.** It is referenced in this ADR as a v0.2 deliverable. We should not ship v0.1.0 without at least a one-page sketch of how extensions register (plugin manifest? server config? both?) so that contributors know the door is real.
- **The vendor-boundary rule "no LLM call inside this server" is precedent-setting.** Future servers (`mcp-translation`, `mcp-guardrail`) will face the same question. Codifying the rule here means all four substrate servers route LLM use through the user's MCP client, not through embedded vendor SDKs. Council should confirm this stance.

## Notes for `mcp-server-builder`

- All four schemas are at `packages/mcp-cognitive-graph/schemas/*.schema.json` and are the source of truth. Generated Python types SHOULD be derived from these (e.g. via `datamodel-code-generator`) rather than hand-written.
- The local store is SQLite + sqlite-vec per ADR decision 7 above. SQLCipher is opt-in via profile.
- Embedding model defaults to local Ollama (`nomic-embed-text-v1.5`); `fastembed-py` (`gte-small`) is the no-Ollama fallback. Both are local-only; cloud embeddings require explicit profile opt-in and a persistent banner per Area 2 privacy norms.
- No network access. The server MUST refuse to start if its environment is configured with any remote embedding endpoint unless the user's profile has `privacy.embeddings: cloud`.
- Source URLs are stored verbatim and MUST NOT be fetched by this server under any code path.
- Dedup behaviour and alias thresholds are open questions; ship sensible defaults and surface them in server logs so the council can review with real data.
