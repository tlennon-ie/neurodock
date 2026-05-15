# 0004 — Profile schema design (NeuroDock Profile v0.1.0)

- **Status:** proposed
- **Date:** 2026-05-15
- **Deciders:** Maintainer council (TBD), `mcp-architect`
- **Consulted:** `mcp-server-builder` (consumes from every server), `skill-author` (consumes from every skill), `clinical-reviewer` (consent fields), `governance-author` (ETHICS alignment)
- **Informed:** `accessibility-auditor`, `doc-writer`, `release-pilot`, `changelog-keeper`

## Context

The profile is the single cross-cutting consent-and-preference manifest for NeuroDock. Every MCP server reads it; every skill respects it; the CLI installer writes it; presets in `profiles/` extend it. It lives at `~/.neurodock/profile.yaml` by default (plan.md §6) and is loaded into memory on session start.

Three properties make this contract unusually load-bearing:

1. **Cross-cutting.** Two Python packages (`mcp-chronometric`, `mcp-cognitive-graph`, `clinical`) and a TypeScript core (`@neurodock/core`) must agree on its shape. The schema is therefore not owned by any one server; it lives in `packages/core/schemas/` so each consumer references the same JSON Schema 2020-12 document.

2. **Consent-bearing.** Three fields are consent gates: `privacy.embeddings` (does anything leave the machine?), `privacy.telemetry` (is anything traced?), `privacy.os_idle_consent` (may `mcp-chronometric.idle_status` read OS state?). Each is independently opt-in. Per ETHICS principle 2 ("we never block a user's action without their pre-configured consent"), these defaults must be conservative and the wire format must make consent visible rather than implicit.

3. **Forward-evolving.** We expect to add fields every quarter as features land (e.g. `translation.tone_axes` in Phase 2, `guardrails.hyperfocus.escalation_ladder` in Phase 3). Old installs cannot break when this happens, and a v0.1.0 loader must round-trip a v0.2.0 file without stripping unknown keys — otherwise a user who upgrades, edits, and downgrades silently loses preferences.

The five-tool decomposition of `mcp-chronometric` (ADR 0001) already binds two of the profile's fields (`chronometric.hyperfocus_break_minutes`, `chronometric.end_of_day_local`) and one consent gate (`privacy.os_idle_consent`). This ADR consolidates the rest.

## Decision drivers

1. **Lived-experience-led defaults.** Every default — `motion: reduced`, `output_format: answer_first`, `reading_font_hint: atkinson_hyperlegible`, `max_chunk_size: 7` (with 5 as the ADHD-tuned preset override), `sycophancy_check: warn` — is chosen because it is the safer ND-friendly value, not because it is the most "neutral" or matches industry defaults.
2. **Forward-compatibility over strictness.** Old installs must keep working. Permissive parsing is a hard requirement.
3. **No PII required.** `display_name` is free-form (one letter is fine); `neurotypes` is self-ID; no email, no real name, no date of birth, ever.
4. **Opt-in for cloud, telemetry, and OS idle.** All three default to local-only / off / false.
5. **Composability over monolith.** Presets (`profiles/`) can be extended via `extends:` so users don't have to hand-author every field.
6. **One source of truth.** The schema lives at `packages/core/schemas/profile.schema.json` and is referenced by `$id` from every consumer. No package re-declares the shape.

## Considered options

### Option A — Flat TOML config

A single flat `~/.neurodock/profile.toml` with dotted keys (`identity.neurotypes`, `chronometric.hyperfocus_break_minutes`).

**Rejected because:**

- TOML's array-of-tables syntax is awkward for the nested `chronometric.zones` map.
- The ecosystem precedent (`leantime`, `kipi-system`, every Claude-skill profile we've inspected) is YAML; switching format costs friction for contributors who already know the convention.
- TOML's strict typing actually works against forward-compat: adding a typed sub-table later means parsers reject older inputs.

### Option B — Nested YAML with strict schema (`additionalProperties: false`)

The canonical "schema-first" approach. Loaders reject any unknown key.

**Rejected because:**

- Breaking change every quarter. A v0.1.0 install reading a v0.2.0 file would fail validation on a key like `translation.tone_axes`. This forces lockstep upgrades across packages — exactly the cross-package coupling we are trying to avoid (plan.md §3 "backward compatibility").
- Worse, a downgrade scenario silently loses data: if a user edits a v0.2.0 file under a v0.1.0 loader and the loader strips unknown keys before re-emitting, the v0.2.0 fields are gone.
- This is the failure mode `.claude/agents/mcp-architect.md` flags as "no silent breaking changes."

### Option C — Nested YAML with permissive forward-compat (`additionalProperties: true` everywhere) — chosen

Loaders accept unknown keys at every nesting level and MUST preserve them on round-trip. Known keys are validated against the schema; unknown keys pass through. A separate `neurodock profile validate` CLI command surfaces typos (which permissive parsing would otherwise swallow).

### Option D — Per-skill configs

Each skill ships its own config block (`.config/neurodock/skills/<name>.yaml`).

**Rejected because:**

- Fragments consent. A user opting into cloud embeddings would have to repeat the toggle in every skill's config. ETHICS principle 4 (no aggregation) is harder to enforce when consent state lives in N files.
- Defeats the "Claude that knows me" experience (plan.md §3) — the user wants one place to set preferences.
- Plugin authors would re-derive identity/neurotype detection logic; we want that centralised in the loader.

## Decision

Adopt **Option C: nested YAML with permissive forward-compat.**

### Shape (summarised; canonical definition in `profile.schema.json`)

| Block | Required? | Notes |
|---|---|---|
| `identity` | Yes | Only required block. Contains `display_name` (free-form), `neurotypes` (enum array), optional `additional_notes`. |
| `preferences` | No | `output_format`, `max_chunk_size`, `reading_font_hint`, `motion`. All defaulted. |
| `chronometric` | No | `hyperfocus_break_minutes`, `end_of_day_local`, `zones`, `session_overlap_policy`. |
| `guardrails` | No | `rumination_threshold`, `rumination_window_minutes`, `sycophancy_check`. |
| `privacy` | No | `embeddings`, `telemetry`, `os_idle_consent`. |
| `schema_version` | No | Optional self-declared version string. |
| `extends` | No | Optional single-level preset extension. |

### Seventeen binding design choices

1. **`identity.neurotypes` is self-identification, never a diagnosis claim.** Enum: `adhd | asd | audhd | ocd | dyslexia | dyspraxia | tourette | other`. Plus optional free-form `additional_notes`. Per ETHICS, self-ID is sufficient; this field is *never* used to gate features. It is an input to skill activation: a skill tagged `adhd` activates iff `"adhd" in identity.neurotypes`. `audhd` is treated as a first-class identity (combined ADHD + autism), not as a derived `["adhd", "asd"]`, because the lived experience differs from either alone.

2. **`preferences.output_format`** enum: `answer_first | conventional | bullet_first`. Default `answer_first` per plan.md §6.

3. **`preferences.max_chunk_size`** integer 1..20, default 7 (Miller's-number neighbourhood). 5 is the manifesto-tuned ADHD default and ships in `profiles/presets/adhd-*` rather than as the schema default, so non-ADHD users aren't surprised by a tight list.

4. **`preferences.reading_font_hint`** enum: `atkinson_hyperlegible | lexend | system_default`. Default `atkinson_hyperlegible` per plan.md §2 (evidence-based for dyslexia and ND readability broadly).

5. **`preferences.motion`** enum: `reduced | system | full`. Default `reduced` per plan.md §2 ("no animation by default").

6. **`chronometric.hyperfocus_break_minutes`** integer 15..240, default 90 per plan.md §8. The 60-min gentle / 90-min nudge / 120-min hard-surface ladder shape is fixed in v0.1.0; this field re-anchors the 'nudge' rung only.

7. **`chronometric.end_of_day_local`** optional `HH:MM` string in user's local timezone, pattern-validated. When present, used by hyperfocus monitor for the after-end-of-day nudge described in plan.md §6.

8. **`guardrails.rumination_threshold`** integer 1..20, default 3 per plan.md §8.

9. **`guardrails.rumination_window_minutes`** integer 5..1440, default 90.

10. **`guardrails.sycophancy_check`** enum: `off | warn | refuse`. Default `warn`. `off` still logs locally for self-audit; `warn` injects a counter-prompt and surfaces a marker; `refuse` declines further validation until new information is provided.

11. **`privacy.embeddings`** enum: `local | cloud_voyage | cloud_openai`. Default `local`. Cloud options trigger a visible session-start notice.

12. **`privacy.telemetry`** enum: `off | local_otel_only | full`. Default `off` per plan.md §4. `full` is reserved in v0.1.0 and requires a future ADR plus clinical-reviewer sign-off.

13. **`privacy.os_idle_consent`** boolean, default false. Required true for `mcp-chronometric.idle_status` to return real data (ADR 0001).

14. **Forward-compatibility rule.** `additionalProperties: true` at every object level. Loaders MUST preserve unknown top-level and nested keys on round-trip. A v0.1.0 loader reading a v0.2.0 file must re-emit those v0.2.0 keys unchanged. This is the central correctness property of this schema and is documented at the top of `profile.schema.json` as a `$comment`.

15. **`identity` is the only required block.** Every other block is optional; defaults are applied by the loader at read time, not written into the file. The minimal valid profile is two fields long (`display_name`, `neurotypes`).

16. **Profile location precedence** (highest wins):
    1. `$NEURODOCK_PROFILE_PATH` env var (testing/CI override)
    2. `$XDG_CONFIG_HOME/neurodock/profile.yaml` (Linux convention)
    3. `~/.neurodock/profile.yaml` (default per plan.md §6)
    4. `./profile.yaml` (project-local override; lowest precedence so a user's home profile beats whatever happens to sit in CWD)

17. **Composition via `extends:`.** A profile MAY declare `extends: "presets/<name>"` to inherit from a preset bundled with the `profiles/` package. v0.1.0 supports **single-level extension only**; deep chaining (preset extending preset) is deferred to a future RFC. The extended preset's fields are merged shallowly, with the local file winning on every key.

### Defaults are loader-applied, not file-written

The schema declares `default:` values for documentation, but those defaults are **applied by the loader at read time**, not written into the file when `neurodock init` scaffolds it. This means:

- The minimal profile stays minimal — users see only the fields they actually care about.
- Changing a default in v0.2.0 takes effect for existing installs without requiring profile migration.
- Documentation (`profile.example.yaml` and the schema's `description` fields) is the canonical place users go to discover what defaults exist.

### Validation strategy

- `additionalProperties: true` makes typo detection a `neurodock profile validate` CLI responsibility, not a load-time failure. The validate command warns on unknown keys (with a "did you mean X?" suggestion when close to a known key) but never refuses to load.
- Known fields are still validated strictly: an out-of-range integer or an enum value not in the allowed set IS a load-time error. Forward-compat protects unknown keys, not malformed known values.

## Consequences

### Positive

- **One source of truth for consent.** All three consent gates (`embeddings`, `telemetry`, `os_idle_consent`) live in one file. ETHICS principle 4 (no population-level aggregation) is enforced structurally: there is no per-skill consent store to leak from.
- **Old installs survive schema bumps.** A v0.1.0 loader can read every future profile without modification. Cross-package version coupling is broken.
- **Presets compose well.** `extends:` lets `profiles/adhd-engineer`, `profiles/audhd-founder` etc. ship sensible bundles without duplicating preference blocks.
- **No PII surface.** The schema cannot accidentally collect email or birthdate; those fields don't exist and contributors who try to add them face an ADR-level conversation.
- **Lived-experience-led defaults are the path of least resistance.** A user who never touches their profile gets `motion: reduced`, `output_format: answer_first`, `embeddings: local`, `telemetry: off`, `os_idle_consent: false`. They have to actively opt in to any less-safe behaviour.

### Negative

- **Loaders must implement defaults carefully.** Every consumer (TS core, Python clinical, each MCP server) must apply the same defaults the same way, or behaviour diverges. Mitigation: a single TS `loadProfile()` and a single Py `load_profile()` reference implementation live in `@neurodock/core` and `neurodock-core` (Py); other packages import rather than re-implement.
- **`neurodock profile validate` is now a required CLI surface.** Without it, typos like `neurotpes:` parse cleanly under permissive mode and silently disable a user's skill activations. Validate is gated on Phase 1 exit, not optional.
- **Round-trip preservation is a non-trivial loader property.** Naive `yaml.safe_load` → dict → `yaml.dump` will strip comments and re-order keys. We need `ruamel.yaml` (Py) and a comment-preserving YAML library (TS) for any write path. Read paths can use the simpler libraries.
- **`extends:` introduces a resolution step.** Loaders must resolve the preset before applying defaults, and must handle the case where the preset is unavailable (see open question 1).

## Open questions

1. **How does `extends:` resolve when the named preset is unavailable?** Two clean positions:
   - **Error:** refuse to load; force the user to install the missing preset package.
   - **Warn-and-use-defaults:** log a structured warning, ignore the `extends:` clause, apply schema defaults.

   Recommended: **warn-and-use-defaults**, because the alternative bricks a working install over a missing dependency. Council to confirm before Phase 1 ships.

2. **How are schema version mismatches surfaced to the user?** When a v0.1.0 loader reads a profile declaring `schema_version: "0.2.0"`, the loader knows there may be fields it doesn't understand. Options: silently ignore unknown fields (current behaviour per the forward-compat rule), emit a one-line stderr notice on first load per session, or surface in the next interactive prompt. Recommended: a one-line stderr notice on first load per session, plus a `neurodock profile diff` command. Not scary; informative.

3. **Should `display_name` default from `$USER` / `%USERNAME%` at `neurodock init` time?** Recommended: **yes** — friction reduction. The user can change it immediately; defaulting it removes one prompt from the install flow. The CLI installer rather than the loader applies this default, because `display_name` is a required field in the schema and we want validation to enforce that a profile sitting on disk has an explicit value.

## Notes for downstream consumers

- The schema's `$id` (`https://schemas.neurodock.org/profile/v0.1.0/profile.schema.json`) is the stable reference identifier even before that URL serves content. Loaders MAY validate against the local file at `packages/core/schemas/profile.schema.json`; the `$id` is what changes when the schema bumps.
- Patch and minor bumps within v0.1.x MUST be additive-only: new optional fields, new enum values, relaxed constraints. Any field rename, enum-value removal, or required-field addition is a major bump and ships at `/v1.0.0/...`.
- The TS type for the profile lives in `@neurodock/core` and SHOULD be derived from the schema (e.g. via `json-schema-to-typescript`) rather than hand-written. Same for the Python `pydantic` model in `neurodock-core`.
- Skill SDKs (`@neurodock/skill-sdk`, `neurodock-skill`) MUST expose a profile-aware formatter that respects `preferences.output_format`, `preferences.max_chunk_size`, and `preferences.motion` without each skill re-deriving the logic.
