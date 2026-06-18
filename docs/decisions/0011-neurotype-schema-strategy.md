# 0011 — Neurotype schema strategy (per-neurotype tailoring policy)

- **Status:** accepted
- **Date:** 2026-06-18
- **Deciders:** Thomas Lennon (maintainer), `mcp-architect`
- **Consulted:** `mcp-server-builder` (implements the shared shaping layer and the task-fractionator hooks), `accessibility-auditor` (owns the presentation hints — line height, motion, voice), `eval-curator` (owns the conformance suite that must keep validating one shape)
- **Informed:** `doc-writer`, `skill-author`, `release-pilot`, `changelog-keeper`

## Context

NeuroDock recognises eight self-identified neurotypes (`adhd`, `asd`, `audhd`, `ocd`, `dyslexia`, `dyspraxia`, `tourette`, `other`). We are about to add per-neurotype tailoring across the MCP servers and the profile schema: task-fractionator hooks that pace differently, new profile fields that capture sensory and motor preferences, and a shared shaping layer that consumes those preferences. Before any of that work touches a schema, we must lock the policy for _how_ a schema is allowed to vary by neurotype — because every downstream change depends on the answer, and a wrong answer here is expensive to unwind once consumers have committed to it.

The question is narrow and load-bearing: does per-neurotype tailoring justify forking the _required output shape_ of a tool — a different schema per neurotype, a required field that only appears for some types, a type that narrows under a given neurotype — or does it ride entirely on top of a single stable shape? Two earlier ADRs already constrain the answer. [ADR 0005](0005-translation-tool-design.md) (re-affirming the posture from ADRs 0001–0003) established the additive-only public-contract guarantee for substrate tool schemas: within a `v0.x` line, schemas only ever gain optional fields, and existing clients keep working. [ADR 0004](0004-profile-schema-design.md) established the same forward-compat rule for the profile, with `identity.neurotypes` declared as _self-identification that never gates a feature_. This ADR makes the consequence of those two rules explicit for the tailoring work, so the rule is decided once rather than re-litigated in every PR that adds a field.

## Decision drivers

1. **Additive-only contract is non-negotiable.** ADR 0005's guarantee — existing clients never break; schemas only gain optional fields — is the property we are most determined not to lose. Per-neurotype tailoring must not become the exception that quietly reintroduces breaking changes.
2. **Servers stay neurotype-blind at the schema level.** Consistent with ADR 0004, the neurotype is a profile input, not a schema discriminator. A tool's _shape_ must not depend on which neurotype the user identified; only how its fields are _populated_ may differ.
3. **One conformance suite, not eight.** A single eval/conformance suite must keep validating one shape for all neurotypes. Forking the shape per type would multiply the test surface by eight and let per-type drift hide behind a passing-for-some suite.
4. **Tailoring belongs in values and hints, not in structure.** The lived-experience difference between, say, an ADHD pace and a dyspraxia pace is expressed by _what the numbers are_ (a longer time buffer, a coarser chunk size) and by _optional presentation hints_ — not by a different document layout.
5. **Forward-compatibility parity with the profile.** New profile fields follow the same rule the profile already lives by: optional, additive, never required, never type-narrowing.

## Considered options

### Option A — Fork the output schema per neurotype

A discriminated union keyed on neurotype, or a separate schema file per type, so each neurotype gets the exact required shape its tailoring wants.

**Rejected because:**

- It breaks the ADR 0005 additive-only guarantee at the structural level. A client built against the `adhd` branch is not built against the `asd` branch; "the schema for tool `X`" stops being a single thing clients can target.
- It makes the neurotype a schema discriminator, which directly contradicts ADR 0004's "self-ID never gates a feature." A server that branches its required output on neurotype is no longer neurotype-blind.
- It multiplies the conformance suite by eight and invites per-type drift: a field that is required under one type and absent under another is a contract that no single client can satisfy.

### Option B — One schema per tool; variation via populated fields and optional additive hint fields (chosen)

Keep exactly one output schema per MCP tool. Express per-neurotype variation by (a) how existing fields are _populated_ — different values, different pacing, different chunk sizes — and (b) _new, optional, additive_ "presentation/behaviour hint" fields that a tailored consumer may read and an untailored consumer may ignore. The required shape never changes; schemas only ever gain optional fields.

### Option C — A single mega-schema with every per-type field made required

One shape, but every conceivable per-type field is present and required, with neurotype-irrelevant fields filled with sentinels.

**Rejected because:**

- Required fields that are meaningless for most neurotypes are noise, and a required field is a breaking addition the moment it lands — it violates additive-only just as surely as a fork does.
- Sentinel-filling required fields pushes correctness onto every consumer and every test, the opposite of the "one shape, validated once" property we are protecting.
- It confuses "the field exists in the schema" with "the field is meaningful for this user," which is exactly the ambiguity optional hint fields are designed to avoid.

## Decision

**We keep one output schema per MCP tool. We do NOT fork or branch the required output shape by neurotype.** Per-neurotype variation is expressed by (a) how existing fields are populated, and (b) new, optional, additive "presentation/behaviour hint" fields — never by changing the required shape and never by adding a required field. This preserves the ADR 0005 additive-only public-contract guarantee: existing clients keep working, and schemas only ever gain optional fields.

### Binding rules

1. **New per-neurotype fields MUST be optional and additive.** Never required. Never type-narrowing. A field added for one neurotype's benefit is, at the schema level, simply a new optional field available to every consumer. This is the same rule the profile and the tool schemas already live by (ADR 0004, ADR 0005); this ADR states that the tailoring work is bound by it with no exception.

2. **The neurotype enum value is NOT a branch point in output schemas.** Servers stay neurotype-blind at the schema level. There is no discriminated union keyed on `identity.neurotypes`, no required field that appears only for some types, and no type that narrows under a given type. Tailoring rides on knob values (how fields are populated) and on optional hint fields (what extra advisory structure a tailored consumer may read).

3. **The profile schema may add new OPTIONAL fields.** Candidate additions for the tailoring work include `line_height_hint`, `voice_input_preferred`, `time_buffer_multiplier`, `motor_fatigue_aware`, `calendar_phase`, `weekday_overrides`, `protected_windows`, and `deadline_cluster_awareness`. Every one of these is optional and additive, defaulted by the loader at read time (per ADR 0004), and never required. None of them gates a feature; each is an input that the shaping layer and the hooks may read.

4. **Richer per-type structure, if ever truly needed, is an optional presentation-hint sub-object — never a per-type schema split.** If a neurotype's tailoring genuinely needs nested structure beyond a flat hint field, the answer is an optional `presentation_hint` (or similarly named) sub-object added to the single shape, populated when relevant and absent when not. The answer is never "a second schema for this neurotype."

5. **One conformance suite still validates one shape for all neurotypes.** Per-neurotype _behaviour_ is tested via slices (a fixture set per neurotype that asserts the right values and the right hint population), not via schema variants. The schema-conformance gate validates exactly one shape; the behavioural gate validates that the one shape is populated correctly for each type.

### Where tailoring actually lives (for the avoidance of doubt)

| Concern                        | Mechanism                                                                                   | Schema impact                        |
| ------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------ |
| Pace, chunk size, buffers      | How existing fields are populated (knob values)                                             | None — values change, shape does not |
| Sensory / reading preferences  | New optional profile fields (e.g. `line_height_hint`) read by the shaping layer             | Additive optional profile field only |
| Motor / input preferences      | New optional profile fields (e.g. `voice_input_preferred`, `motor_fatigue_aware`)           | Additive optional profile field only |
| Per-output presentation advice | Optional hint field (or optional `presentation_hint` sub-object) on the tool's single shape | Additive optional field only         |
| Which neurotype this is        | A profile input the shaping layer and hooks read                                            | None — never a schema discriminator  |

### Cross-cutting alignment with prior ADRs

- **Additive-only public contract** ([ADR 0005](0005-translation-tool-design.md), inheriting ADRs 0001–0003): within a `v0.x` line, every change to a tool schema is a new optional field, a new enum value treated as opaque by older clients, or a relaxed constraint. A field rename, an enum-value removal, or a required-field addition is a major bump. This ADR adds no exception for neurotype.
- **Self-ID never gates a feature** ([ADR 0004](0004-profile-schema-design.md)): `identity.neurotypes` is an input to populating fields and hints, not a discriminator that changes a required shape. `audhd` remains a first-class identity (per ADR 0004), tailored on its own terms rather than as a derived `["adhd", "asd"]`.
- **Forward-compat parity**: the new optional profile fields follow ADR 0004's loader-applied-defaults and round-trip-preservation rules. A loader that does not understand `time_buffer_multiplier` preserves it on round-trip; a loader that does understand it applies a neutral default when it is absent.

## Consequences

### Positive

- **The additive-only guarantee survives the tailoring work intact.** No client built against a tool's schema can be broken by the addition of per-neurotype tailoring, because tailoring only ever adds optional fields and changes values.
- **Servers stay neurotype-blind, so the privacy and consent posture is unchanged.** A server that does not branch on neurotype does not need to know the neurotype to produce a valid response; the neurotype stays a profile-side input the user controls.
- **One conformance suite keeps working.** The schema-validation gate validates one shape for all eight neurotypes; per-type correctness is a behavioural slice on top of that one shape, not a fork of it.
- **Contributors learn one rule.** "Optional, additive, never required, never type-narrowing" is the same rule the profile and tool schemas already follow. There is no new schema discipline to learn for tailoring work.
- **Tailoring can grow indefinitely without a major bump.** New neurotype-specific hints and new optional profile fields land as minor, additive changes for as long as the `v0.x` line lasts.

### Negative

- **Consumers that want tailored output must read optional fields defensively.** A hint field may be absent; an untailored client ignores it and a tailored client treats absence as "no specific advice." This is the standard cost of optional-field forward-compat and is already familiar from ADR 0004/0005 consumers.
- **Some genuinely per-type structure is expressed more verbosely than a fork would allow.** An optional `presentation_hint` sub-object carries fields that are only meaningful for some neurotypes. We accept this verbosity as the price of one stable shape; it is strictly cheaper than eight shapes.
- **Behavioural correctness is not enforced by the schema alone.** Because the schema validates one shape, "is this output tailored correctly for an `ocd` user?" is a behavioural-slice question, not a schema-validation question. The conformance suite must carry both gates; the schema gate alone is necessary but not sufficient.
- **The discipline must be actively held.** The cheapest-looking fix for a future tailoring need will sometimes be "just add a required field for this type" or "just branch the shape." This ADR exists so that shortcut is recognisably out of bounds without re-opening the debate.

## Open questions

1. **Naming of the optional hint surface.** Whether per-output advice lives in flat hint fields (e.g. `line_height_hint` echoed onto the output) or in a single optional `presentation_hint` sub-object is an implementation choice for `mcp-server-builder` and `accessibility-auditor`. Either satisfies this ADR; the constraint is only that it is optional and additive. Recommended: a single optional `presentation_hint` sub-object once more than two hint fields exist, to avoid scattering related advice across the top level.

2. **Default values for the new optional profile fields.** ADR 0004 makes defaults loader-applied. The neutral default for each new field (e.g. `time_buffer_multiplier: 1.0`, `motor_fatigue_aware: false`) should be chosen as the _least-tailored_ value so that an untouched profile behaves exactly as it does today. Maintainer and `accessibility-auditor` to ratify the neutral defaults before the fields ship.

3. **Whether the shaping layer is a shared library or per-server logic.** This ADR fixes the schema policy, not the implementation locus of the shaping layer. Whether the layer lives once in `@neurodock/core` / `neurodock-core` (preferred, to avoid per-server drift) or is re-implemented per server is an implementation decision for `mcp-server-builder`. Recommended: shared, for the same single-source-of-truth reasons ADR 0004 centralised the profile loader.

## Notes for downstream consumers

- A tool's published `inputSchema` and output shape are stable across all neurotypes. Build against the single shape; treat any per-neurotype hint field as optional and absence-tolerant.
- New optional profile fields are read-when-present, neutral-when-absent. A consumer that does not understand a field MUST preserve it on round-trip (ADR 0004) and MUST NOT treat its absence as an error.
- The neurotype is never a reason to expect a different document shape. If you find yourself writing `if neurotype == ... then expect field Y`, that is a sign tailoring has leaked into structure; raise it rather than coding around it.

## Notes for `mcp-server-builder` and `eval-curator`

- The schema-conformance gate validates exactly one shape per tool. Do not add a per-neurotype schema variant to the conformance corpus; add per-neurotype behavioural slices that assert value/hint population against the single shape.
- New optional profile fields ship as additive minor changes with loader-applied neutral defaults. No required-field addition, no enum narrowing, no type change is in scope for tailoring work under this ADR.
- The task-fractionator hooks pace via populated field values (chunk size, buffers) and optional hints, not via a forked output shape. If a hook appears to need a new required field, escalate to an ADR amendment rather than landing it.
