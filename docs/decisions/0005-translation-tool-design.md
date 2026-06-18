# 0005 — Translation tool design (mcp-translation v0.1.0)

- **Status:** accepted
- **Date:** 2026-05-16
- **Deciders:** maintainer (TBD), `mcp-architect`
- **Consulted:** `mcp-server-builder`, `extension-engineer` (parallel — owns the browser-extension scaffold that consumes the same contracts), `eval-curator` (Phase 2 corpus owner), (advisory on PII handling and consent surfaces)
- **Informed:** `skill-author` (consumer in `asd-meeting-translator` and Phase 2 PR-review skills), `accessibility-auditor`, `doc-writer`, `prompt-librarian`

## Context

`mcp-translation` is the third substrate MCP server NeuroDock will ship and the engine of Area 2 (communication and translation). Per it launches in Phase 2 alongside a browser extension, and the same prompt library and eval corpus power both surfaces — one MCP server, one extension, one prompt repo, one test harness.

The user stories in §7 partition cleanly into four jobs:

1. **Decode an incoming message** — surface the explicit ask, rank likely subtext with confidence, mark ambiguous spans, recommend a next action. (Autistic engineering director story.)
2. **Score an outgoing message's tone** — directness, warmth, urgency on 0..100 axes, flag baseline-delta phrases. (ADHD PM story.)
3. **Rewrite an outgoing message** toward a target register while preserving technical terms and intent.
4. **Brief a meeting transcript** into the four-section structure: my asks, others' asks, decisions, ambiguous items quoted verbatim. (Director-after-strategy-meeting story.)

ADRs 0001 (chronometric), 0002 (cognitive-graph), and 0003 (task-fractionator) established the precedents this ADR adopts: ISO 8601 timestamps with offsets, structured errors, profile-driven thresholds, server-side state, **no embedded LLM SDK in the substrate server**. ADR 0002 §8 in particular codified the "vendor boundary" rule for the cognitive graph; this ADR re-affirms and extends it for a server whose value-add is precisely structured prompting.

## Decision drivers

1. **Extension parity.** The browser extension and the MCP server are two surfaces over one contract. The schemas defined here are the source of truth for both. Designing the tool surface poorly means re-doing it in two places.
2. **No LLM SDK inside the server.** The substrate's vendor-neutrality rule and ADR 0002 §8 both say substrate servers do not call vendor SDKs. `mcp-translation` is the precedent-setting case for a server whose entire job is prompt orchestration. We confirm: the server returns structured prompt assets and/or typed analysis schemas; the caller's MCP client (Claude / OpenAI / local Ollama) executes the actual model call. The tool response is the model output, returned in the structured shape these schemas define.
3. **Local-first / cloud-mode parity.** The server's behaviour must be identical whether the user has configured local Ollama or a cloud provider. The server itself is provider-agnostic. The user's profile and the extension's settings choose the provider; the server only orchestrates prompts.
4. **Eval-corpus-driven correctness.** Per plan.md §7, every prompt change runs against the eval suite in CI. Each schema cites the eval slice that validates its prompts (`packages/evals/corpora/translation/...`). The corpus does not exist yet at v0.1.0 tag — `eval-curator` is collecting it in Phase 2 — but the contract is recorded now so the gate is built before the prompts are written.
5. **Verbatim quoting for clinical safety.** `brief_meeting.ambiguous_items` quote the exact transcript span. Per plan.md §7 acceptance, ambiguous items MUST anchor verbatim; the schema enforces this at the type level (`verbatim: const true`, `quoted_span` required, server-side `VERBATIM_ANCHOR_FAILED` error if the LLM fabricates a span). This is not aesthetic — it is anti-hallucination armour for a meeting brief that an autistic director will rely on.
6. **Privacy.** Default mode is local-only. The server stores no inputs and emits no telemetry. PII redaction is upstream (extension/user choice). Cloud mode is opt-in at the extension / profile layer; the server itself is agnostic but reports `model_provenance` so the surface can render an honest "cloud mode" banner.

## Considered options

### Option A — One tool `analyze_message(direction, ...)`

A single tool that takes a `direction` discriminator (`incoming | outgoing | meeting`) and dispatches internally. Smaller surface, fewer tool definitions for the LLM to choose from.

**Rejected because:**

- "Convenience parameters that mix two concepts" — the failure mode `.claude/agents/mcp-architect.md` warns against. The four jobs have genuinely different inputs (one needs `baseline_messages`, one needs `preserve_terms`, one needs a `transcript` of up to 200k chars), different outputs (axes scores vs rewritten text vs a four-section brief), and different eval slices.
- Versioning is brittle: a change to the meeting-brief shape would force a major bump on the whole tool, breaking the unrelated tone-check callers.
- LLM-side, an overloaded discriminator tool is harder to invoke correctly than four small tools with one-sentence descriptions.

### Option B — Four-tool decomposition (chosen)

`translate_incoming`, `check_tone`, `rewrite_outgoing`, `brief_meeting`. Each maps one-to-one with a user story; each independently versionable; each independently testable against its own eval slice.

### Option C — Tool per channel (`translate_slack`, `translate_gmail`, ...)

A tool per integration surface, optimising prompts per channel.

**Rejected because:**

- Channel is a parameter, not a tool boundary. The structural job is identical; only register expectations vary.
- Combinatorial explosion: 4 jobs × 8 channels = 32 tools. The substrate's tool inventory rule (one snake_case verb, ≤4 words, ≤4 tools per server in Phase 2) collapses immediately.
- New channels become a major undertaking instead of an enum addition.

### Option D — Pipeline tool (`translate_then_rewrite`)

A single tool that runs the full incoming-decode → outgoing-draft flow.

**Rejected because:**

- The caller composes more flexibly than a pre-baked pipeline. The extension might want to run only `translate_incoming` (no draft); a PR-review skill might want only `check_tone`. A pipeline tool is a god-tool with a different name.
- Stateful pipelines belong to skills, not servers (per plan.md §3 architecture).

## Decision

We adopt **Option B: the four-tool decomposition** as specified in the four schema files at `packages/mcp-translation/schemas/`.

### 1. Tool surface

| Tool                 | Purpose                                                                               | Required input          | Output shape                                                                                                                 |
| -------------------- | ------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `translate_incoming` | Decode subtext + ambiguity in an incoming message                                     | `text`                  | `explicit_ask, likely_subtext[], ambiguity{detected, spans[]}, recommended_next_action, eval_corpus_slice, model_provenance` |
| `check_tone`         | Score outgoing message on directness/warmth/urgency axes; flag baseline-delta phrases | `text`                  | `axes, axes_target?, baseline_delta?, flagged_phrases[], suggested_rewrite_hint, eval_corpus_slice, model_provenance`        |
| `rewrite_outgoing`   | Rewrite preserving technical terms + intent, shifted toward target register           | `text, target_register` | `rewritten, preserved_terms[], unpreserved_terms[], diff_summary, eval_corpus_slice, model_provenance`                       |
| `brief_meeting`      | Transcript → four-section structured brief                                            | `transcript, me`        | `my_asks[], others_asks[], decisions[], ambiguous_items[], eval_corpus_slice, model_provenance`                              |

### 2. No LLM SDK inside the server (precedent-setting confirmation)

This is the third substrate server. ADR 0002 §8 made the call for the cognitive graph; here we confirm and extend it for a server whose entire job is structured prompting. The substrate rule is now fully load-bearing across three servers:

- The server constructs structured prompts and validates structured outputs.
- The caller's MCP client (Claude Code, Claude Desktop, a custom MCP host) invokes the LLM.
- The browser extension's service worker plays the same role for in-page surfaces (local Ollama via native messaging, or cloud provider per explicit user config).
- The server itself imports no provider SDK and opens no provider socket.

Practically, this means the FastMCP tool handlers in `mcp-translation` will use MCP's prompt-orchestration capabilities (sampling, prompt resources) or return a typed "please run this prompt and conform to this schema" envelope. `mcp-server-builder` decides the implementation tactic; this ADR fixes the constraint.

### 3. Local-first / cloud-mode parity

The server's behaviour is identical regardless of whether the user has configured local Ollama or a cloud provider. The server does not branch on provider. Two consequences:

- The `compatibility.privacy` field on every schema reads `local-only-by-default`.
- Each tool returns `model_provenance: {mode, provider, model}` reflecting what the caller's MCP client reported. The extension and any skill rendering output MAY use this to surface an honest "cloud mode" banner (per plan.md §7 privacy model).

The server's logs never include input text. (This is an implementation requirement for `mcp-server-builder` rather than something the schema can enforce, but it is stated here so it cannot be quietly skipped.)

### 4. Eval corpus binding

Every tool's schema requires `eval_corpus_slice` in the output, identifying the slice that validates the prompt template behind this tool. v0.1.0 references paths under `packages/evals/corpora/translation/` that do not yet exist; `eval-curator` is collecting them in Phase 2. The contract is recorded now so:

- Every prompt change in this server SHALL run the named slice in CI before merge.
- New tools or new prompt branches add new slices; renaming a slice is a major bump.
- The 30-meeting pilot referenced in plan.md §7 acceptance lives at `packages/evals/corpora/translation/meeting/v0.1.0/`.

This binding is the "every prompt change runs against the eval suite in CI" gate from §7, made structural.

### 5. Verbatim quoting in `brief_meeting.ambiguous_items`

Per plan.md §7 acceptance: "Ambiguous items quote the exact transcript span."

The schema enforces this at three layers:

- `AmbiguousItem.verbatim` is `const: true` in v0.1.0. (The field exists for forward-compatibility with v0.2 summarised ambiguity; v0.1.0 callers can assert it is always true.)
- `AmbiguousItem.quoted_span` is required with `{start_char, end_char, text}`.
- The server's `VERBATIM_ANCHOR_FAILED` error rejects any LLM response where `quoted_span.text != input.transcript.slice(start_char, end_char)`. The server does not "fix up" the response; it rejects and lets the caller retry.

This is anti-hallucination armour for a tool a director will rely on after a 60-minute strategy meeting. A fabricated "ambiguous item" that is not in the transcript is worse than no brief at all.

### 6. Privacy and PII

- Default mode is local-only. The server stores no inputs; the server emits no telemetry.
- PII redaction is upstream. The server analyses whatever text it is given. The extension and the user's profile decide what gets passed.
- `brief_meeting` operates on third-party speech (meeting transcripts). Cloud-mode for `brief_meeting` SHOULD prompt the user with a stronger consent surface than other tools. That is the extension's responsibility, not this server's. The schema's `compatibility.privacy` notes this expectation so it is not lost.
- No tool returns content the caller did not give it. There is no remote-fetch path.

### 7. Channels and target-register enums

- Channel enum: `email | slack | linear | github | notion | gdocs | outlook | generic`. Eight values cover the §7 in-page surfaces; `generic` is the fallback. New channels are minor bumps.
- Target register enum: `direct | warm | formal | concise | clarifying`. Five values cover the eval-corpus tone targets. `clarifying` is included because surfacing missing information is a distinct register, not a variant of `direct`.

Callers MUST treat unknown enum values as opaque (forward-compatibility). This is consistent with ADR 0001's enum-evolution rule.

### 8. Ambiguity span representation

All ambiguity / flagged-phrase spans use `{start_char, end_char, reason}` with zero-indexed character offsets (`start_char` inclusive, `end_char` exclusive). This is the representation the browser extension uses for in-page highlighting. Standardising the shape across `translate_incoming.ambiguity.spans`, `check_tone.flagged_phrases`, and `brief_meeting.*.quoted_span` lets the extension share one rendering primitive.

### 9. Tone-axis calibration

Three axes on 0..100: `directness | warmth | urgency`. Calibration:

- 50 is neutral.
- <30 is notably low; >70 is notably high.
- Calibration anchors live in the eval corpus README (the corpus is the ground truth, not the schema).
- `baseline_delta` is in signed percentage points (-100..100). Per plan.md §7 acceptance, phrases with thread-baseline delta >25 percentage points are flagged. The 25pp threshold is an internal heuristic, tunable in v0.1.x as the corpus grows; it is not part of the wire contract.

### 10. `model_provenance` is required output

Each tool returns `{mode, provider, model}` reflecting what the caller's MCP client reported. The server does not know the model itself; the caller is expected to pass it through. Surfaced so the extension and any consuming skill can render an accurate cloud-mode banner per plan.md §7 privacy norms.

### Cross-cutting alignment with prior ADRs

- ISO 8601 with explicit offsets for any time fields (none in v0.1.0; reserved for additive expansion).
- Enums for coarse classifications, with forward-compatibility ("unknown value = opaque") on the caller side.
- Structured errors, never silent.
- `null` is a first-class return for "not applicable" (e.g. `explicit_ask` when the message contains no explicit ask).
- Schemas versioned via `$id` path; v0.1.x is additive-only.

## Consequences

### Positive

- **Clear separation of concerns.** Four single-purpose tools that map one-to-one with the user stories in plan.md §7. Each independently versionable; each independently testable.
- **One contract, two surfaces.** The browser extension and the MCP server consume the same JSON Schemas. The extension-engineer agent does not have to re-derive the shape; the schemas are the source of truth.
- **Anti-hallucination teeth.** `brief_meeting`'s verbatim-anchor enforcement is the strongest correctness gate any substrate tool has shipped. It will catch the most damaging failure mode (fabricated meeting ambiguity) at the server layer rather than relying on the user to notice.
- **Vendor-neutral by construction.** Three substrate servers in a row now enforce "no LLM SDK inside the server." This is the rule by precedent, not by exception.
- **Eval-gated prompt evolution.** Every prompt change runs the cited eval slice in CI. Prompt regressions become CI failures, not user reports.

### Negative

- **Caller composes for combined flows.** "Translate this incoming message, then draft a reply, then check its tone, then rewrite it" is four tool calls. This is the right boundary (each step is independently useful) but the caller pays the orchestration cost.
- **Eval corpus does not yet exist.** v0.1.0 schemas reference slice paths that `eval-curator` will populate in Phase 2. There is a window where the schemas claim eval binding the substrate cannot yet honour. We accept this because tagging the slices now is the only way to make them load-bearing.
- **`baseline_messages` source is undefined.** The `check_tone` tool accepts a baseline sample but does not specify where it comes from. The extension probably reads from the open thread; a Claude Code consumer might read from `mcp-cognitive-graph`. Resolving this is an open question (below).
- **Language packs unmodelled.** `target_language` is in `translate_incoming` but the language-pack registration mechanism (plan.md §7 contribution paths) is not specified. v0.1.x or v0.2 work.
- **No streaming.** Long meeting briefs return as a single response. v0.1.0 does not model streaming output; for 90-minute transcripts this is acceptable but for the 3-hour edge case the caller chunks. Future minor version MAY add streaming.

## Open questions

1. **Where do `baseline_messages` come from?** Three credible positions:

   - **Caller-supplied** (current schema): the extension or skill assembles the baseline before calling. Simplest; pushes responsibility outward.
   - **Cognitive-graph lookup**: a future minor version adds `baseline_from: {person: "Roberto", lookback_days: 30}` and the server queries `mcp-cognitive-graph` directly. Tighter integration; violates "no cross-server dependencies" from `.claude/agents/mcp-architect.md`.
   - **Hybrid**: caller-supplied wins; a skill MAY wrap the call and inject baselines from the cognitive graph. (Recommended.)

   Recommendation: ship caller-supplied in v0.1.0. The cross-server-lookup variant is a skill, not a server feature.

2. **Should `brief_meeting` optionally output a Mermaid sequence diagram?** The plan.md §11 visual-organizer skill makes Mermaid first-class. Three positions:

   - **No** — visualisation belongs to the visual-organizer skill, which can consume the structured brief.
   - **Optional output field** in v0.1.x — `mermaid_sequence` populated when the caller passes `include_diagram: true`.
   - **Separate tool** `diagram_meeting(brief)` in v0.2.

   Recommendation: option 1 (no). Keep the substrate tool focused; the visual-organizer skill composes.

3. **How do language packs override prompt templates?** plan.md §7 calls out Hiberno-English, German directness norms, Japanese keigo as contribution lanes. The schema has `target_language` (BCP-47) but no registration mechanism. Open positions:

   - **File-system convention**: `prompts/<tool>/<bcp47>.md` shadows `prompts/<tool>/default.md`.
   - **Plugin manifest**: language packs ship as plugins with `plugin.yaml type: language-pack` per plan.md §4.
   - **Server config**: registered at server start from a YAML.

   Recommendation: align with plan.md §4's plugin model. Language packs are plugins. Defer the manifest schema work to a separate ADR.

4. **Is `recommended_next_action.draft_reply` the right place to draft, or should the caller always chain to `rewrite_outgoing`?** Two positions:

   - **Inline draft (current)**: `translate_incoming` may return a draft reply when action is `reply|clarify|acknowledge`. Saves a round trip.
   - **No inline draft**: `translate_incoming` returns only the recommendation; the caller calls `rewrite_outgoing` (or a future `draft_reply` tool) to produce text.

   Recommendation: inline draft as a convenience, but the caller is expected to pipe through `rewrite_outgoing` when register matters. Keep both paths.

5. **PII handling boundary.** The server explicitly does NOT redact. The extension and the user are responsible. Maintainer should confirm this stance — it is the only choice consistent with vendor-neutrality (the server has no PII model) but it pushes a real responsibility upstream.

6. **`brief_meeting.me` is required.** Without a "me" speaker label the four-section partition is ill-defined. The schema returns `ME_REQUIRED` rather than guessing. Maintainer should confirm; the alternative is to default `me = null` and skip the partition (return only `decisions` and `ambiguous_items`), which feels worse.

## Cross-cutting concerns for the maintainer

- **The vendor-boundary rule is now load-bearing across three servers.** `mcp-chronometric`, `mcp-cognitive-graph`, and `mcp-translation` all forbid an embedded LLM SDK. `mcp-task-fractionator` and (Phase 2+) `mcp-guardrail` will inherit the rule by precedent. Maintainer should ratify "no LLM SDK in substrate servers" as substrate-wide doctrine, not a per-server choice.
- **The eval corpus is a hard dependency for shipping.** v0.1.0 schemas claim eval-binding the corpus does not yet provide. The Phase 2 release of `mcp-translation` SHOULD NOT tag v0.1.0 until at least the four named slices exist with smoke coverage. `eval-curator`'s milestone gates the server's release.
- **The verbatim-anchor enforcement on `brief_meeting` will reject some LLM outputs.** Local Ollama at 7B is more likely to fabricate spans than a frontier cloud model. The server will report rejections; we may discover that the local-first path needs a stricter prompt or a smaller transcript chunk size. This is acceptable: rejecting is the correct failure mode.
- **The browser extension is a parallel work stream.** The `extension-engineer` agent is scaffolding the extension against these schemas right now. Any change to the schemas before v0.1.0 tag must be propagated. Maintainer should designate a single owner of "schema-as-source-of-truth" for the duration of Phase 2.
- **Language packs and domain packs are contribution lanes .** The plugin manifest schema for `type: language-pack` is referenced but unspecified. A short ADR-0006 sketch is needed before external contributors can land packs.

## Notes for `mcp-server-builder`

- All four schemas are at `packages/mcp-translation/schemas/*.schema.json` and are the source of truth. Generated Python types SHOULD be derived from these (e.g. via `datamodel-code-generator`) rather than hand-written.
- The server MUST NOT import any LLM vendor SDK. Use MCP's prompt/sampling primitives or return a typed prompt-asset envelope that the caller's MCP client executes.
- The server MUST NOT open any network socket to a model provider.
- The server MUST NOT log input text. Log structured event names and outcomes only.
- `brief_meeting` MUST validate `quoted_span.text == transcript.slice(start_char, end_char)` for every ambiguous item before returning. On mismatch, return `VERBATIM_ANCHOR_FAILED` rather than fixing up.
- `rewrite_outgoing` MUST check `preserve_terms` against the rewritten text via exact substring match and report gaps in `unpreserved_terms`; do not auto-retry.
- `eval_corpus_slice` is a string identifier; the server does not need to read the slice at runtime (the slice is for CI).
- `model_provenance` is read from MCP-client-supplied context (sampling response metadata) or set to `{mode: "unknown", provider: "unknown", model: "unknown"}` if the client did not report it.

## Notes for `extension-engineer`

- These four schemas are the wire contract the extension's service worker MUST conform to. The extension and the MCP server are wire-compatible by construction.
- Ambiguity spans (`translate_incoming.ambiguity.spans`, `check_tone.flagged_phrases`, `brief_meeting.*.quoted_span`) share the `{start_char, end_char}` shape; one rendering primitive can highlight all three.
- The "cloud mode" banner per plan.md §7 reads `model_provenance.mode == "cloud"`. The server reports honestly; the extension renders accordingly.
- PII redaction is the extension's job. The server does not redact.
- The extension's IndexedDB history schema SHOULD mirror these output schemas to keep the local history queryable in the same shape.
