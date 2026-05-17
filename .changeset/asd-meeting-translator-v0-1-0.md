---
"@neurodock/core": patch
---

# skill: asd-meeting-translator v0.1.0

First release of the `asd-meeting-translator` skill (versioned via SKILL.md
frontmatter; not an npm or PyPI artefact). Phase 2 deliverable per
`plan.md` §11 and the sixth of the six launch skills.

- Activation triggers: `/brief`, `/meeting`, several natural-language phrase patterns, `*.transcript.txt` / `*.meeting.md` file patterns, and pasted ≥ 200-line speaker-labelled prose.
- Calls `mcp-translation.brief_meeting` to produce a four-section brief — decisions, my asks, others' asks, ambiguous items quoted verbatim.
- Reads prior decisions from `mcp-cognitive-graph.recall_decisions` and writes new decisions back via `record_fact`.
- Does not interpret motivation, infer subtext, or fabricate asks. `VERBATIM_ANCHOR_FAILED` from the server surfaces directly.

References: `plan.md` §6 (launch-skill table), ADR 0005,
`packages/skills/asd-meeting-translator/SKILL.md` frontmatter.

The `@neurodock/core` patch above is bookkeeping; the skill ships via the
federated registry once Phase 3 lands. Until then it ships as part of the
repository tree.

## Open questions before publish — GATING

- **Lived-experience review required** by at least one autistic reviewer per `CODEOWNERS` norm before tagging the v0.2.0 umbrella.
- Skill carries `status: beta` in its frontmatter. v0.2.0 ships it as a developer preview; promotion to `stable` waits for the Phase 2 field signal.
