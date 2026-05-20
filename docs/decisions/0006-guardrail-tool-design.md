# 0006 — Guardrail tool design (mcp-guardrail v0.1.0)

- **Status:** proposed
- **Date:** 2026-05-16
- **Deciders:** maintainer (TBD), , `mcp-architect`
- **Consulted:** `mcp-server-builder`, (co-required per `.claude/agents/mcp-architect.md` "clinical-implications tool"), `skill-author` (consumer of `check_rumination` from `ocd-decision-finalizer`)
- **Informed:** `eval-curator` (field-study corpus owner), `accessibility-auditor`, `doc-writer`, `governance-author`

## Context

`mcp-guardrail` is the substrate's clinical layer — Area 3 in and the entire subject of `ETHICS.md`. It is the only server whose tool changes require sign-off from both the maintainer and the . It is also the only server whose detectors directly mediate the conversation between an LLM and a neurodivergent user, which makes every schema choice ethically loaded.

Per :

- **Phase 2 (months 4–7)** ships `mcp-guardrail` v0.1 with **rumination detection only**.
- **Phase 3 (month 8+)** ships all three detectors live once the (kicked off in month 6, 30–50 ND professionals, 8-week pilot) endorses the heuristics and thresholds.

This ADR locks the schemas for all three tools **now**, in advance of Phase 2 shipping, so:

1. The contract `ocd-decision-finalizer` and any other Phase-2 consumer skill commits to is the contract Phase-3 honours.
2. Future implementation work is constrained to filling in heuristic code, not redesigning the wire.
3. Cross-server consistency (with `mcp-chronometric` ADR 0001 and `mcp-cognitive-graph` ADR 0002) is preserved.

The schemas are at:

- `packages/mcp-guardrail/schemas/check_rumination.schema.json`
- `packages/mcp-guardrail/schemas/check_hyperfocus.schema.json`
- `packages/mcp-guardrail/schemas/check_sycophancy.schema.json`

The latter two carry an `x-implementation-status: schema-only-v0.1.0` annotation; their runtime returns `DETECTOR_NOT_YET_IMPLEMENTED` until Phase 3.

## Decision drivers

These are direct restatements of the `ETHICS.md` five commitments, each translated into a schema invariant:

1. **No treatment claims (commitment 1).** No tool name, field, enum value, or description uses clinical vocabulary that could be read as diagnosis or treatment. The `ocd-decision-finalizer` SKILL.md already forbids `rumination`, `anxiety`, `obsessive`, etc. in user-facing output; the schemas avoid them in field names and surface them only in technical heuristic descriptions where auditability outweighs the risk.
2. **No silent blocks (commitment 2).** Every detected==true output carries a non-empty `override_options` array (enforced via JSON Schema `allOf` conditionals). Every detection carries a `reason` string the skill MAY surface verbatim.
3. **Public, auditable heuristics (commitment 3).** Every detection output carries a `heuristic.{name, version, description}` object. The actual rule code lives in `packages/clinical/` and is `git`-auditable. The schemas reference these by path (e.g. `packages/clinical/rumination/word_overlap_jaccard.py`).
4. **No aggregation (commitment 4).** The server is stateless. The schemas' `compatibility.side_effects` is uniformly "None"; `compatibility.telemetry` is uniformly "None". Detection events MAY be written to the cognitive graph by a calling skill, but the guardrail server never persists them.
5. **False-positive humility (commitment 5).** Every detection output carries a required `confidence: float 0..1` field and a `false_positive_feedback_path` URL. The schemas document a recommended consumer pattern: low-confidence detections SHOULD NOT trigger hard interventions.

Additional drivers, inherited from the substrate's earlier ADRs:

6. **Composable over monolithic (manifesto §4).** The guardrail server MUST NOT import other substrate servers as Python libraries.
7. **Vendor neutrality ().** No code path may depend on a specific LLM vendor. The schemas reflect this: `check_sycophancy` returns a `counter_prompt` string for the caller to use, never invokes a model itself.
8. **Quotability (ADR 0001).** `check_hyperfocus.output.prior_intent` is verbatim user text. Skills quote, never paraphrase.

## Considered options

### For `check_rumination` similarity backend

#### Option A — Word-overlap Jaccard (chosen for v0.1.0)

Tokenise, lowercase, stoplist, compute set Jaccard. Zero dependencies, fully deterministic, no model artefacts on disk, runs identically on every platform.

**Pros:** transparent (a user can audit the rule by reading 30 lines of Python), reproducible (every detection is deterministic given the input), portable (no model download or runtime requirement), trivially testable.

**Cons:** misses paraphrases. "Should I use Postgres" and "is SQLite the wrong call for this" express the same anxiety with low word overlap.

#### Option B — Sentence-embedding cosine (deferred to v0.0.2)

Use the same local embedding stack already required by `mcp-cognitive-graph` (Ollama `nomic-embed-text-v1.5` or `fastembed-py` `gte-small`). Compute cosine of mean-pooled sentence embeddings.

**Pros:** catches paraphrases; reuses an embedding model already loaded for the cognitive graph.

**Cons:** introduces a dependency at Phase 2 ship time that has not yet stabilised in the cognitive graph (per ADR 0002 open question 1, embedding thresholds are not yet calibrated); harder to audit ("why did these two prompts match at 0.78?"); model weights complicate the "heuristics are public" commitment because the public artefact is then the model file, not 30 lines of source.

**Deferred** to v0.0.2 once `mcp-cognitive-graph` has shipped its embedding-resolution path and calibrated thresholds. The v0.1.0 schema is forward-compatible: `heuristic.name` enum already includes `embedding_cosine` as a reserved value.

#### Option C — Topic modelling over recent prompts

Cluster recent prompts (e.g. via online LDA) and flag when N prompts fall into the same cluster.

**Rejected** for v0.1.0 and v0.0.2: introduces unsupervised learning state, which violates the stateless-server principle; harder to explain to a user reading the heuristic description; brittle on the small windows we actually evaluate (N=3 prompts).

### For `check_hyperfocus` coupling to `mcp-chronometric`

#### Option A — Direct Python import of `neurodock-mcp-chronometric`

The guardrail server depends on the chronometric package and reads its in-memory session state.

**Rejected** because:

- Violates manifesto §4 (composable over monolithic). Tightens two servers into one logical unit.
- Forces a deployment correlation: every guardrail release must validate against a chronometric release.
- Makes mocking the chronometric state in `check_hyperfocus` tests harder, not easier.
- Forecloses on the future where a user runs a non-`neurodock-mcp-chronometric` time server.

#### Option B — Caller-supplied snapshot (chosen)

The caller (a skill or an MCP client orchestrator) reads the chronometric server's state via its existing tools, packages the result into `chronometric_snapshot`, and passes it to `check_hyperfocus`.

**Pros:** loose coupling, swappable time source, deterministic tests (the snapshot is plain data), respects the single-LLM-boundary architecture from .

**Cons:** more work for the caller; risk of the caller passing stale snapshots. Mitigated by including `now` in the snapshot so the server can detect implausibly-old snapshots in future versions (deferred — not in v0.1.0).

### For override-token vocabulary

#### Option A — Closed enum per tool (chosen for v0.1.0)

Each tool ships a closed enum of override tokens. Skills branch on token values.

**Pros:** skills can safely switch on token; cross-skill consistency on what `fresh-context` means.

**Cons:** every new override is a minor version bump.

#### Option B — Free-form token strings

Schemas allow any string as an override token; skills parse them.

**Rejected** because it would push skill authors toward inventing their own vocabularies, fragmenting the user experience across skills.

The v0.1.0 vocabulary is union-of-three: `fresh-context`, `override-once`, `disable-for-session`, `lower-sensitivity`, `snooze-15m`, `snooze-once`, `commit-and-close`, `extend-end-of-day`, `i-want-validation`, `explain-the-match`. Each tool exposes only the subset that makes sense for its detection.

## Decision

We adopt:

1. **Three schemas, locked at v0.1.0** as drafted in `packages/mcp-guardrail/schemas/`.
2. **Word-overlap Jaccard** for `check_rumination` v0.1.0 (defaults: window 90 min, threshold count 3, similarity 0.55).
3. **Caller-supplied `chronometric_snapshot`** for `check_hyperfocus`. No direct imports.
4. **Schema-only deployment** for `check_hyperfocus` and `check_sycophancy` in Phase 2; their runtime returns `DETECTOR_NOT_YET_IMPLEMENTED`. Phase 3 turns them on after field-study endorsement.
5. **Closed override-token vocabulary** as listed above. New tokens require a minor version bump and sign-off.
6. **`x-clinical-review-required: true`** annotation on every schema, recording the standing requirement that changes to these schemas — or to the heuristic implementations in `packages/clinical/` — require sign-off per its agent definition and consultation with the per `ETHICS.md` and .
7. **`heuristic_source` path** recorded in each schema's `compatibility` block. The path is normative: the source code IS the auditable specification per `ETHICS.md` commitment 3.

### Cross-cutting alignment with ADR 0001 and ADR 0002

- ISO 8601 with explicit offsets for all `*_at` and `now` fields. ISO 8601 durations for `elapsed`, `time_since_stated_end`.
- Enums for coarse signals (`level`, `pattern`, `suggested_action`, override tokens). Floats only for `confidence` and `similarity`.
- `null` is a first-class return for "no session" / "no end-of-day stated" cases.
- Errors are structured codes with prose descriptions; `DETECTOR_NOT_YET_IMPLEMENTED` is a documented success-of-the-contract error for v0.1.0.
- Schemas versioned via `$id` path; v0.1.x is additive-only.
- `additionalProperties: false` on every object.

### Vendor-boundary discipline

`check_sycophancy` returns a `counter_prompt` string but does not call any LLM. The calling skill is responsible for any model interaction. This is the same vendor-boundary rule ADR 0002 §3 codified for `mcp-cognitive-graph`. All four substrate servers route LLM use through the user's MCP client.

## Consequences

### Positive

- **Testable, deterministic detection in v0.1.0.** Word-overlap Jaccard is unit-testable with frozen fixtures; the field-study corpus can be replayed against this implementation in CI.
- **Vendor-neutral.** No model dependency, no API key, no remote endpoint. Runs identically on every supported platform.
- **Transparent.** A user reading 30 lines of `packages/clinical/rumination/word_overlap_jaccard.py` can audit exactly why a detection fired.
- **Composable.** Loose coupling means the chronometric server, the cognitive graph, and the guardrail server release independently.
- **Forward-compatible.** The `heuristic.name` enum reserves slots for `embedding_cosine` and `topic_model`. The override-token enum can grow additively. The level/pattern enums are closed but ordered for ergonomic extension.
- **Skill contract is stable.** `ocd-decision-finalizer` can integrate against `check_rumination` v0.1.0 knowing the wire is permanent for the v0.1.x line.

### Negative

- **Jaccard misses paraphrases.** "Should I use Postgres" vs "is SQLite the wrong call" will not match in v0.1.0. Users with phrasing-flexible rumination patterns get fewer detections. Mitigated by v0.0.2 embedding work and by the conservative default threshold (0.55) being calibrated on the field-study corpus.
- **Schema-only Phase 2 deployment for hyperfocus and sycophancy** means callers must handle `DETECTOR_NOT_YET_IMPLEMENTED`. This is documented in every schema but is a real burden on Phase-2 skill authors. Mitigated by making the error explicit and including a `phase: "3"` metadata field.
- **Caller-supplied chronometric snapshot is more work for the caller.** Mitigated by exposing a `chronometric-snapshot` helper in `@neurodock/skill-sdk` (already foreshadowed in ADR 0001's "Negative consequences" section).
- **The override-token vocabulary will need to grow.** Each addition is a minor version bump. The risk is that contributors propose tokens faster than the maintainer and can review them. Mitigated by documenting the closed vocabulary explicitly and routing additions through this ADR's amendment process.

## Open questions

1. **Where does the field-study corpus live?** Per the false-positive rate target is < 5% measured on this corpus. The corpus needs to be: opt-in, anonymised, versioned in the open per `ETHICS.md`. Open: does it live under `packages/evals/guardrail-corpus/` (in-repo, contributors PR examples) or on HuggingFace under the `neurodock` org (mirrors `mcp-translation`'s corpus path from §7)? Recommended: HuggingFace, consistent with the translation eval corpus, with a small in-repo seed for CI replay.

2. ** process before tagging v0.1.0.** The schemas are locked here but the runtime ships in Phase 2 (rumination) and Phase 3 (hyperfocus + sycophancy). What does sign-off look like for a Phase-2 tag if the Phase-3 schemas are part of the same package? Two clean positions: (a) tag each detector independently (`@neurodock/mcp-guardrail-rumination@0.1.0`, etc.); (b) tag the package and document detector status in the release notes. Recommended: (b), with `x-implementation-status` carrying the truth in the schema itself. Maintainer to confirm.

3. **Override token vocabulary — canonical list vs free-form.** v0.1.0 ships closed enums. Open: is there a mechanism for plugin-distributed skills to introduce their own tokens (e.g. a skill could surface `take-a-walk` as an override option)? Recommended: no in v0.1.0; the closed vocabulary IS the consistency surface. Plugins that want custom tokens propose them through the same minor-version ADR amendment process.

4. **How is "this detector fired" surfaced to the user without breaking flow?** The schemas return structured signals; the rendering decision is the skill's. But there is a cross-skill consistency question: should the substrate provide a standard "guardrail fired" UI primitive (a small inline marker, a footer line, a side-channel notification) so the experience is the same across skills? Recommended: defer to `design-system-keeper` for a UI primitive proposal, tracked separately. The schemas as drafted do not constrain the rendering.

5. **What happens when a user repeatedly invokes `disable-for-session`?** The override is intentional — `ETHICS.md` commitment 2 makes this the user's call — but a user who disables every detector every session has likely opted out of the layer. Open: should the install-time consent be re-confirmed on a cadence? Should the substrate prompt the user "you have disabled rumination detection in 8 of your last 10 sessions; would you like to disable it permanently in your profile?" Recommended: defer; handle this in profile UX, not in the schemas. But flag as a follow-up for the maintainer.

6. **Multi-language support for word-overlap Jaccard.** The v0.1.0 stoplist is English. Users prompting in other languages get worse Jaccard scores. Open: ship per-language stoplists in `packages/clinical/rumination/stoplists/<lang>.txt`, or defer until embedding-based similarity replaces Jaccard? Recommended: defer; v0.0.2 with embeddings is the better fix.

## Cross-cutting concerns for the maintainer

- **The closed override-token vocabulary is a public commitment.** Once shipped, the ten tokens are harder to change than the entity types in `mcp-cognitive-graph` (skills will branch on token values, and users will type them). the maintainer should review the seed vocabulary before v0.1.0 tags.
- **The `clinical_review_required: false` invariant binds the agent fleet.** Every PR touching these schemas or `packages/clinical/` must wait on . This is the first substrate server with that property; the orchestrator and CI workflows need to enforce it.
- **The "stateless server, skills MAY write to cognitive graph" boundary is precedent-setting.** It says: detection events that get persisted are persisted with the calling skill's intent and the user's knowledge, never by the detector itself. Maintainer should confirm this stance.
- **The schema-only Phase-2 deployment of two detectors is unusual.** It says: the contract is permanent, the implementation is gated on field-study results. Maintainer should confirm this is the right way to lock contracts ahead of evidence; the alternative (delay the schemas until Phase 3) would mean Phase-2 skills couldn't plan against them.

## Cross-cutting concerns for the

- **The Jaccard threshold of 0.55 is a clinical-relevance call, not just a statistical one.** A higher threshold (e.g. 0.7) reduces false positives at the cost of missing more paraphrased rumination loops. The should weigh in before the threshold ships, and the should explicitly measure threshold sensitivity.
- **The hyperfocus escalation ladder (none → gentle → nudge → hard) and the trigger of crossing `end_of_day_local` as an escalation step are clinically loaded choices.** The should confirm whether crossing a user's stated end-of-day should escalate level by exactly one step, or whether the relationship is more nuanced (e.g. severity multiplier).
- **The sycophancy pattern enum's `praise_without_evidence` and `escalating_validation` patterns are particularly subjective.** What an raters considers appropriate validation vs sycophantic affirmation varies. The should over-sample these patterns and the should review the raters' calibration before the v0.1.0 thresholds lock.
- **The `i-want-validation` override token is ethically deliberate.** It says: the user can explicitly request the validation the detector would suppress. The should confirm this respects user autonomy without subverting the detector's purpose.
- **The false-positive feedback path is a public GitHub issue template.** A user reporting a false positive thereby discloses the prompt that fired. The should review the issue template (to be drafted by `governance-author`) to ensure the disclosure surface is appropriate.
- **Quarterly review cadence per .** This ADR establishes the v0.1.0 baseline; the should set the first quarterly review date in their first meeting and confirm the agenda includes thresholds, heuristics, and the false-positive issue queue.

## Notes for `mcp-server-builder`

- All three schemas are at `packages/mcp-guardrail/schemas/*.schema.json` and are the source of truth. Generated Python types SHOULD be derived from these (e.g. via `datamodel-code-generator`) rather than hand-written.
- The heuristic implementations live in `packages/clinical/` as documented in each schema's `compatibility.heuristic_source`. The server imports them; it does not inline them.
- The server MUST be stateless: no SQLite, no JSONL, no in-memory caches that survive a tool call. Any persistence is a regression.
- The server MUST NOT emit telemetry, log detection events, or open network sockets. CI MUST enforce this with a packet-capture check on the test suite (see `eval-curator` for the harness).
- `check_hyperfocus` and `check_sycophancy` v0.1.0 implementations return `DETECTOR_NOT_YET_IMPLEMENTED` with a `phase: "3"` metadata field. The wire response is structurally a normal MCP tool error; callers handle it gracefully.
- `check_rumination` v0.1.0 implements the word-overlap Jaccard heuristic per the schema example; the unit-test corpus seeds the .
- `x-clinical-review-required` is a schema annotation, not an enforcement mechanism. CI MUST enforce it via a CODEOWNERS rule that requires approval on changes under `packages/mcp-guardrail/` and `packages/clinical/`.

## Notes for

- Standing review authority on this package and `packages/clinical/`. Block any PR that changes a threshold, a heuristic, an enum value, or copy that surfaces to the user without appropriate to the change's scope.
- The seed thresholds (rumination similarity 0.55, hyperfocus 60/90/120 minutes, sycophancy reassurance count 3) are tentative pending the . Resist proposals to tune them on intuition; the field-study corpus is the calibration surface.
- The override-token vocabulary is the user-autonomy contract. Resist proposals to remove tokens, change their semantics, or hide them behind configuration.
