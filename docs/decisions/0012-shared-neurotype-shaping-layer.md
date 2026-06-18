# 0012 — Shared neurotype-shaping layer (one artifact, two assemblers, server-side injection)

- **Status:** accepted
- **Date:** 2026-06-18
- **Deciders:** Thomas Lennon (maintainer), `mcp-architect`
- **Consulted:** `mcp-server-builder` (implements the Python assembler and the `reader_context` wiring in mcp-translation), `extension-engineer` (owns the TypeScript assembler and the byte-identical cutover), `eval-curator` (owns the cross-language parity test and the per-neurotype eval slices)
- **Informed:** `doc-writer`, `skill-author`, `accessibility-auditor`, `release-pilot`, `changelog-keeper`
- **Supersedes:** none
- **Resolves:** [ADR 0011](0011-neurotype-schema-strategy.md) open question 3 (shared shaping layer vs. per-server logic)

## Context

[ADR 0011](0011-neurotype-schema-strategy.md) fixed the _schema policy_ for per-neurotype tailoring — one output shape per tool, variation in populated values and optional hints, never a forked shape — and left the _implementation locus_ of the shaping layer as its open question 3, recommending a single shared source of truth in core. We are now building R1: making per-neurotype prompt tailoring reach **every** MCP client, not just the browser extension. Today the tailoring content lives hard-coded inside the extension's TypeScript. A user on Claude Desktop, Cursor, or any other MCP client that talks to `mcp-translation` gets the generic, untailored prompt. That gap is the whole point of R1, and closing it forces a decision about _where the tailoring content lives_ and _who assembles it_.

The question is narrow and load-bearing: the extension does not call `mcp-translation` — it assembles the per-neurotype addendum client-side and POSTs to the user's own provider — while every other MCP client reaches the model _through_ the server. So the tailoring content has to be available to **two runtimes** (a TypeScript client path and a Python server path) and assembled **identically** in both, or the same user gets different tailoring depending on which surface they came through. A wrong answer here either re-implements the content twice (guaranteeing drift) or locks the tailoring to TypeScript (leaving every Python-backed client untailored). This ADR records the boundary we chose and the parity machinery that keeps the two paths honest.

## Decision drivers

1. **Reach every client, not just the extension.** R1's success condition is that a Claude Desktop / Cursor / generic MCP user gets the same per-neurotype tailoring the extension user already gets. The chosen boundary must put tailoring on the server path without abandoning the extension's direct-to-provider path.
2. **One source of truth for the content.** The per-(tool × neurotype) prose is lived-experience content curated with `accessibility-auditor`. It must exist once. Two hand-maintained copies — one TS, one Python — would drift the moment either is edited.
3. **Vendor-neutrality is non-negotiable.** [ADR 0005](0005-translation-tool-design.md) made "no LLM SDK inside a substrate server" load-bearing doctrine across three servers. The server may assemble prompt _text_; it must not gain a model call or an LLM SDK.
4. **ADR 0011 must hold.** Enum-keyed prompt _content_ is allowed; an enum-keyed _schema_ is not. The single output shape must stay single, and any new server input must be optional and additive.
5. **Absence is identity.** A client that sends no reader context, against a profile with no neurotypes, must get a **byte-identical** generic prompt to today's. Tailoring is something that gets _added_, never something whose absence changes the baseline.

## Considered options

### Option A — The server re-implements the tailoring content in Python

`mcp-translation` grows its own copy of the per-(tool × neurotype) blocks, the fusion rule, the priority order, and the framing, maintained alongside the extension's TypeScript copy.

**Rejected because:**

- It guarantees content drift. The blocks are curated prose that changes as `accessibility-auditor` and lived-experience reviewers refine them; two independently edited copies will diverge, and the divergence is invisible until a user notices their Desktop output differs from their extension output.
- It doubles the curation surface. Every future block edit, every new neurotype, every fusion tweak has to be made twice and reviewed twice, with no machine check that the two copies agree.
- The drift is exactly the failure mode R1 is supposed to prevent — "same user, same preferences, different tailoring depending on surface."

### Option B — A TypeScript-only shared library

Extract the content into a shared TS package and have both the extension and the server consume it.

**Rejected because:**

- It cannot reach the Python servers. `mcp-translation` is Python; Claude Desktop and Cursor reach the model through the Python server path. A TS-only library leaves every non-extension client untailored, which fails R1's reason for existing.
- Shelling a Node process out of a Python server to assemble a prompt string is a deployment and latency liability (and would not survive the hosted-remote Worker environment).
- It optimises for the one surface that already has tailoring at the expense of all the surfaces that do not.

### Option C — A language-neutral data artifact + a thin assembler in each runtime + server-side injection (chosen)

Put the tailoring **content** in a language-neutral JSON artifact in `@neurodock/core` as the single source of truth. Give each runtime a thin, pure assembler that reads the artifact: the existing TypeScript assembler for the extension, and a Python assembler (follow-up PR) for the server. `mcp-translation` reads an optional reader context (or a profile fallback), assembles the addendum, and injects it into its existing `prompt_for_llm_refinement.content`. Keep the two assemblers honest with a cross-language parity test and a byte-identical golden snapshot.

This is the hybrid boundary: content lives once (no drift at the source), each runtime owns a small assembler (so neither has to call the other), and the server injects into the prompt it already returns (so every client through the server gets tailoring without the server gaining a model call).

## Decision

**A language-neutral `neurotype-addenda` data artifact in `@neurodock/core` is the single source of truth for per-neurotype prompt shaping. Both the TypeScript assembler (browser extension) and a Python assembler (`mcp-translation`, landing in a follow-up PR) read it. `mcp-translation` assembles the addendum from an optional `reader_context` input (or a `profile.yaml` fallback) and injects it into its existing `prompt_for_llm_refinement.content`, so every MCP client — not just the browser extension — receives per-neurotype tailoring. The boundary is HYBRID: language-neutral data artifact + a thin assembler in each runtime + server-side injection — chosen over (A) the server re-implementing the content [content drift] and (B) a TypeScript-only shared library [cannot reach the Python servers, Desktop, or Cursor].**

### The artifact

- **Location:** `packages/core/data/neurotype-addenda/v1.json`, validated by `packages/core/schemas/neurotype-addenda.schema.json`.
- **Versioning:** an `artifact_version` semver field; **additive-only within a major** (a new tool, a new neurotype, or a new optional top-level key is non-breaking; a breaking re-shape forks to a new `vN.json` with a new schema `$id`).
- **Contents:** the per-(tool × neurotype) blocks for the four server tools plus `describe_image`; the AuDHD fusion rule (`adhd` + `asd`, or explicit `audhd`, → the fused `audhd` block, dropping `adhd` and `asd`); the neurotype priority order (placement by recency); the conflict footer (emitted at three-or-more effective neurotypes); the cross-cutting `voice_input` block; the `tourette` and `other` special blocks; the generic per-neurotype fallback; and the `output_format` guidance. The **only** interpolation tokens are `{max_chunk_size}` and `{notes}`.

### Binding rules

1. **The artifact is the single source of truth; assemblers are thin and pure.** Neither runtime hard-codes the content. Each runtime has one pure assembler that reads the artifact and reproduces the same assembly order: fusion → priority order → per-tool block (with generic fallback) → `tourette`/`other` specials → cross-cutting `voice_input` block → conflict footer → token interpolation. An assembler holds no content of its own beyond this ordering logic.

2. **The two assembly paths must be provably identical.** Because the extension assembles client-side and POSTs to the user's provider while the server assembles server-side, the standing risk is **content drift between two assembly paths**, not between two content copies. This is mitigated by (i) the one artifact, (ii) a cross-language parity test asserting TypeScript ≡ Python output, and (iii) a byte-identical golden snapshot captured at the extension cutover (already implemented: 9,720 cases across the full cross-product of tools, neurotype combinations, chunk sizes, voice-input states, output formats, and notes).

3. **The server gains exactly one optional, additive input.** `mcp-translation` accepts an optional `reader_context` carrying `neurotypes`, `output_format`, `max_chunk_size`, `voice_input_preferred`, and `additional_notes`, with a `profile.yaml` fallback when the input is absent. **When both are absent, the assembled prompt is byte-identical to today's generic prompt.** The tool's output shape is unchanged.

4. **No model call, no LLM SDK on the server.** The server only assembles prompt _text_ and injects it into the prompt it already returns. It does not call a model and adds no LLM SDK. This preserves [ADR 0005](0005-translation-tool-design.md)'s vendor-neutrality doctrine intact.

5. **Scope is the four server tools.** R1 server scope covers `translate_incoming`, `check_tone`, `rewrite_outgoing`, and `brief_meeting`. `describe_image` is extension-only (there is no server tool for it) and is out of R1 server scope, even though its block ships in the artifact for the extension.

### ADR 0011 compliance

This ADR is the implementation of [ADR 0011](0011-neurotype-schema-strategy.md)'s recommended shared shaping layer, and it stays inside 0011's rules:

- **Enum-keyed _content_ is not an enum-keyed _schema_.** The artifact is keyed by tool and neurotype, but it carries prose, not field constraints. There is no discriminated union, no per-neurotype required field, no type narrowing. The single output shape of each tool is unchanged.
- **The new server input is optional and additive.** `reader_context` is optional, defaulted by the profile fallback and then by neutral absence, exactly as [ADR 0004](0004-profile-schema-design.md) requires of additive inputs. No existing client breaks.
- **One conformance suite still validates one shape.** The schema gate continues to validate the single output shape; per-neurotype correctness is a behavioural slice (the parity test plus the eval slices), not a schema variant.

This **resolves [ADR 0011](0011-neurotype-schema-strategy.md) open question 3** — the shaping layer is shared in `@neurodock/core`, not re-implemented per server — for the same single-source-of-truth reasons ADR 0004 centralised the profile loader.

### Where the moving parts live

| Concern                                               | Mechanism                                                            | Boundary impact                                           |
| ----------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------- |
| Tailoring content (blocks, fusion, priority, framing) | One language-neutral JSON artifact in `@neurodock/core`              | Single source of truth; no per-runtime copy               |
| Extension assembly                                    | TS assembler reads the artifact; POSTs to the user's provider        | No call to `mcp-translation`                              |
| Server assembly                                       | Python assembler reads the same artifact                             | No call out to Node; no model call                        |
| Reaching non-extension clients                        | Server injects the addendum into `prompt_for_llm_refinement.content` | Output shape unchanged                                    |
| Reader preferences on the server                      | Optional `reader_context` input + `profile.yaml` fallback            | Optional/additive; absent ⇒ byte-identical generic prompt |
| Keeping the two paths identical                       | Parity test (TS ≡ Python) + byte-identical golden snapshot           | Drift is caught in CI, not by users                       |

### Phasing

- **PR-A (this branch, done):** the artifact + schema in `@neurodock/core`, the TypeScript assembler, and the extension cutover to read the artifact — proven byte-identical against the previously-shipped hard-coded function (golden snapshot, 9,720 cases).
- **PR-B (follow-up):** the Python assembler, the `profile.yaml` read, the `reader_context` wiring in `mcp-translation`, and the cross-language parity test.
- **PR-C (follow-up):** per-neurotype translation eval slices.

## Consequences

### Positive

- **Every MCP client gets tailoring, not just the extension.** Closing the R1 gap is the whole point: a Claude Desktop, Cursor, or generic MCP user now gets the same per-neurotype shaping the extension user gets, because the server injects it into the prompt it already returns.
- **The content exists once.** Block edits, new neurotypes, and fusion tweaks are made in one artifact and reviewed once. The curation surface does not double.
- **Drift is a CI failure, not a user report.** The parity test and the golden snapshot turn "the two paths diverged" into a red build, so the standing two-assembly-path risk is caught before it ships.
- **Vendor-neutrality and the single output shape both survive.** The server assembles text and injects it; it gains no model call and no LLM SDK (ADR 0005), and the output shape is unchanged (ADR 0011).
- **The baseline is untouched for users who send nothing.** Absence of both `reader_context` and a profile yields a byte-identical generic prompt, so no existing client behaviour changes.

### Negative

- **Two assemblers must be kept in lock-step.** A pure assembler in each runtime is the price of letting the extension keep its direct-to-provider path while the server reaches every other client. The parity test and golden snapshot make this manageable, but they are now load-bearing CI gates that must not be allowed to rot.
- **The artifact is a published surface with its own versioning discipline.** `artifact_version` must move additively within a major; a careless breaking edit to `v1.json` would desynchronise consumers. The schema gate enforces shape, but the additive-only discipline is a human commitment.
- **The server carries prompt-assembly logic it did not have before.** `mcp-translation` now owns a Python assembler and a `reader_context` input. This is a deliberate, bounded addition (text assembly only), but it is more surface than a server that merely returned a static prompt.
- **`describe_image` tailoring stays extension-only for now.** A user who reaches `describe_image`-style functionality through a non-extension client gets no server-side tailoring for it, because there is no server tool. This is in-scope-for-later, not in R1.

## Open questions

1. **Shape of the `reader_context` precedence rule.** When both `reader_context` and `profile.yaml` are present, the input wins; the exact merge granularity (whole-object override vs. field-by-field) is an implementation choice for `mcp-server-builder` in PR-B. Recommended: field-by-field, so a caller can override `output_format` without having to restate every neurotype.
2. **Where the parity test runs in CI.** The TS ≡ Python parity check spans two language toolchains; whether it lives in the Python test job, a dedicated cross-language job, or both is for `eval-curator` and `release-pilot` to settle in PR-B. The constraint is only that a divergence fails the build before merge.
3. **Hosted-remote artifact loading.** The hosted-remote Worker must bundle the artifact at build time (no filesystem read at request time). PR-B should confirm the Python assembler's artifact-load path works under both the stdio/local server and the Worker environment.

## Notes for downstream consumers

- `mcp-translation`'s output shape is unchanged. The per-neurotype tailoring rides _inside_ `prompt_for_llm_refinement.content`; build against the same single shape you already target.
- `reader_context` is optional and absence-tolerant. A client that sends nothing gets today's generic prompt verbatim; a client that sends it gets a tailored prompt. Neither path changes the output schema.
- The artifact is the source of truth. Do not hand-copy blocks into a new runtime — read the artifact through the assembler. A new consuming runtime is a third assembler reading the same `v1.json`, added to the parity test, not a third copy of the content.

## Notes for `mcp-server-builder` and `eval-curator`

- The Python assembler MUST reproduce the TypeScript assembly order exactly (fusion → priority → per-tool block with generic fallback → `tourette`/`other` → `voice_input` → conflict footer → interpolation). The parity test, not code review, is the authority that the two agree.
- The server adds no LLM SDK and makes no model call (ADR 0005). It assembles text and injects it into the existing prompt field only.
- `reader_context` ships as an optional, additive input with a profile fallback; absent both, the prompt is byte-identical to today's. No required-field addition, no enum narrowing, no output-shape change is in scope under this ADR.
- The byte-identical golden snapshot (9,720 cases) is the cutover gate; the cross-language parity test is the ongoing gate. Both must stay green; neither may be relaxed to make an edit land faster.
