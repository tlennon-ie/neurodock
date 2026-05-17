# NeuroDock v0.2.0 — Phase 2 developer preview

**Status:** developer preview (not yet published)
**Date:** 2026-05-17
**Umbrella tag:** `v0.2.0`

v0.2.0 is a coordinated developer-preview marker covering the Phase 2
deliverables from `plan.md` §11. Per the manifesto and §9 (CI/CD), every
package is versioned independently — the `v0.2.0` umbrella tag captures the
coordinated set, not a single repo-wide artefact.

---

## What shipped

| Package | Version | Registry | Headline |
|---|---|---|---|
| `neurodock-mcp-translation` | 0.0.1 | PyPI | Four-tool translation server (incoming / tone / outgoing / meetings) with deterministic baselines and verbatim-anchored meeting briefs. |
| `neurodock-mcp-guardrail` | 0.0.1 | PyPI | Rumination detection live (Jaccard, advisory only); `check_hyperfocus` and `check_sycophancy` schema-locked stubs ready for Phase 3 wiring. |
| `@neurodock/extension-browser` | 0.0.1 | npm | WXT-based Manifest V3 scaffold for Chrome / Firefox / Edge with seven per-site content scripts, popup, cloud-mode banner, and prompt sync. |
| `neurodock-evals` | 0.0.1 | PyPI | Eval harness scaffold, JSON Schemas, ten seed examples across four translation slices, anonymisation pipeline. |
| `asd-meeting-translator` (skill) | 0.1.0 | repo tree | Sixth launch skill; transcript → four-section brief; reads/writes the cognitive graph. |

Phase 1 packages (`mcp-chronometric`, `mcp-cognitive-graph`,
`mcp-task-fractionator`, `@neurodock/cli`, `@neurodock/core`) carry no bump in
v0.2.0. They remain at their v0.0.1 / v0.1.0 from the Phase 1 release.

---

## Architecture decisions

- **ADR 0005 — Translation tool design.** Locks the four-tool surface, the deterministic-baseline + LLM-refinement-prompt envelope, and the no-LLM-SDK-in-server rule for a server whose entire job is prompt orchestration. Establishes verbatim anchoring as anti-hallucination armour for meeting briefs.
- **ADR 0006 — Guardrail tool design.** Locks schemas for all three detectors now; ships rumination live in v0.0.1, schema-only stubs for the other two until the Phase 3 field study. Closed override-token vocabulary. Clinical-reviewer gate on every heuristic change.
- **ADR 0007 — Plugin protocol.** One manifest covering six plugin types (skill, mcp-server, profile, translation-pack, language-pack, theme). Four-tier trust ladder that degrades gracefully for air-gapped installs. License-compatibility gate. Resolves ADR 0005 open question 3 on language-pack override semantics.

Each ADR includes a `Status: proposed`; the v0.2.0 cut is the council's
opportunity to advance them to `accepted`.

---

## What's deferred

These are intentional Phase 3 commitments, not gaps:

- **`check_hyperfocus` and `check_sycophancus`** — schema-locked stubs in v0.0.1; live behaviour waits for the field-study endorsement.
- **Real ND-rater corpus** — eval-curator is collecting; harness is the Phase 2 deliverable, corpus is in-flight.
- **Federated plugin registry** (`plugins.neurodock.org`) — Phase 3.
- **Native messaging bridge** from the browser extension to `~/.neurodock/profile.yaml` — Phase 3.
- **Real local Ollama wiring** in the extension and real cloud provider integration — v0.0.2.
- **Playwright E2E + `axe-core` in CI** for the extension — v0.0.2.
- **Browser store submission** (Chrome Web Store, Firefox Add-ons, Edge Add-ons) — v0.0.2 once the model wiring lands.
- **Language packs for ≥ 3 locales** — Phase 3, via the plugin protocol just landed.
- **Position paper publication** to arXiv — draft in tree at `docs/papers/`; Phase 3 deliverable.

---

## Known limitations

Pulled from each package's `CHANGELOG.md`:

**`mcp-translation`**

- English-only heuristics. BCP-47 `target_language` accepted, but tone / ambiguity vocab is English-only. Language packs land as plugins.
- No real LLM refinement flow — the server returns the prompt; the caller's MCP client executes it.
- No `mcp-cognitive-graph` integration for `check_tone.baseline_messages` — caller-supplied in v0.0.1.
- No streaming. `recommended_next_action.draft_reply` is always null in the deterministic baseline.
- `brief_meeting` decision detection is regex-based and conservative. Decisions without explicit commitment language ("Wednesday it is.") may be missed and require LLM refinement.

**`mcp-guardrail`**

- Word-overlap Jaccard misses paraphrases. v0.0.2 adds embedding cosine similarity (already reserved in the schema enum).
- English stoplist only.
- `check_hyperfocus` / `check_sycophancy` return `DETECTOR_NOT_YET_IMPLEMENTED` until Phase 3.

**`@neurodock/extension-browser`**

- Local mode returns a deterministic `MOCK` response (`model_provenance.provider: "mock"`). Real Ollama wiring is v0.0.2.
- Cloud mode emits `MISSING_CLOUD_PROVIDER` / `CLOUD_NOT_WIRED` until v0.0.2.
- No native messaging bridge yet — profile lives in `chrome.storage.local`, not the on-disk `~/.neurodock/profile.yaml`.
- No Playwright suite, no `axe-core` CI, no store submission scripts in v0.0.1.

**`neurodock-evals`**

- Ten synthesised seed examples only. Real contributed corpora arrive in Phase 2 outreach.
- No HuggingFace publication yet (v0.1.0).
- ND-rater Cohen's kappa adjudication workflow is a single-example demo.
- CI thresholds are permissive; tuning follows real contributions.

**`asd-meeting-translator` skill**

- Brief quality is bounded by `brief_meeting` server quality. Conservative regex-based decision detection in the server means the skill inherits the same recall limit.
- `status: beta` in the frontmatter; promotion to `stable` waits for Phase 2 field signal.

---

## Gating before public release

The v0.2.0 umbrella is **NOT** publishable until the following items are
recorded in the release issue:

- [ ] **Clinical-reviewer sign-off on `mcp-guardrail` v0.0.1** — per ADR 0006 §5 and `ETHICS.md` commitment 3. Sign-off must reference the specific commit hash of `heuristics/` + `_stopwords.py`.
- [ ] **Lived-experience review on `asd-meeting-translator` v0.1.0** — at least one autistic reviewer per `CODEOWNERS` norm. Reviewer self-identification recorded in the PR thread.
- [ ] **Lived-experience review on the rumination advisory copy** in `mcp-guardrail` — at least one OCD-identified reviewer.
- [ ] **Eval corpus structure validated** — `neurodock-evals` harness boots, the ten seed examples load, CI is green on the eval slice tests.
- [ ] **Field-study readiness signal** — `clinical-reviewer` confirms the field-study protocol (`plan.md` §8 "Field study") is drafted, recruitment plan exists, and IRB-equivalent review path is documented. (The study itself runs in Phase 2 month 6; readiness, not completion, is the v0.2.0 gate.)
- [ ] **Council formal approval** per `GOVERNANCE.md` — simple majority for the umbrella tag; consensus required only if any package crosses an ethics-affecting boundary (none currently do).

---

## Migration from v0.1

**None.** v0.2.0 is purely additive across packages. No breaking schema changes
in `mcp-chronometric`, `mcp-cognitive-graph`, or `mcp-task-fractionator`. No
profile schema changes (ADR 0004 invariants preserved).

Workspace-level additions consumers should be aware of:

- Root `pyproject.toml` adds `mypy` overrides for the new Python packages.
- `pnpm-workspace.yaml` adds `spawn-sync` to `allowBuilds` / `onlyBuiltDependencies` for the extension's transitive build chain.
- Three new ADRs in `docs/decisions/` (0005, 0006, 0007).
- One position-paper draft in `docs/papers/` (not yet published to arXiv).
- One plugin contributor guide in the docs site.

Existing v0.1 installs continue to work unchanged. Picking up v0.2.0 is opt-in
per package — install the new MCP servers if you want translation / guardrail
support; otherwise the substrate is unchanged.

---

## References

- `plan.md` §7 (Area 2), §8 (Area 3), §9 (CI/CD), §11 (Phase 2), §12 (governance).
- ADR 0005 — `docs/decisions/0005-translation-tool-design.md`.
- ADR 0006 — `docs/decisions/0006-guardrail-tool-design.md`.
- ADR 0007 — `docs/decisions/0007-plugin-protocol.md`.
- Per-package CHANGELOGs under `packages/<name>/CHANGELOG.md`.
- Skill frontmatter at `packages/skills/asd-meeting-translator/SKILL.md`.
