# ocd-decision-finalizer

A NeuroDock skill that responds to repeat re-validation of an already-made decision. When the user asks "should I really go with X?" or "is this okay?" three or more times on the same decision in the same local day, the skill surfaces the prior decision verbatim from the cognitive graph and declines to re-analyse it until new information is supplied. It is a workflow tool, not a clinical intervention.

This skill is **beta** and **clinical-review-required**. The `clinical_review_required: false` flag in `SKILL.md` is mandatory and will be enforced by the  agent on any future PR.

## When it fires

All three conditions must hold:

- The user's profile declares `"ocd"` in `identity.neurotypes`. Without that self-ID the skill stays silent — the project never infers a neurotype from text.
- The user's message contains one of: `should I really`, `is this okay`, `am I sure`, `should we revisit`.
- The message names a decision the cognitive graph already knows about, and re-validation has been tagged against that decision 2 or more times already today.

## What the user sees

A four-section response naming the decision verbatim, the trade-offs already weighed, a one-sentence grounded reply declining further re-analysis, and an explicit override path.

## The override

Any user can re-issue the same message with `--override "fresh-context"` appended and the skill will respond in normal mode. The override is logged to the local SQLite cognitive graph only — it is never transmitted. This is required by the project's ethics framework: any guardrail that fires must be transparent and overridable. See .

## What this skill is not

It is not a refusal to help. It is not a diagnosis. It is not a judgement. It is a workflow tool that respects the user's prior reasoning by surfacing it rather than regenerating new analysis on top of it.

## How to disable

Remove `"ocd"` from `~/.neurodock/profile.yaml` under `identity.neurotypes`, set `skills.ocd-decision-finalizer.enabled: false`, or remove the trigger phrases under `skills.ocd-decision-finalizer.triggers`. Any of the three works and takes effect immediately.

## What it reads and writes

Reads: `mcp-cognitive-graph.recall_entity`, `mcp-cognitive-graph.recall_decisions`.

Writes: `mcp-cognitive-graph.record_fact` — one `tagged → "re-validated"` row per activation, and optionally one `mentioned_in → <new fact>` row when fresh context is detected. Writes are local-only.

## References

-  — launch skill #4 specification.
-  — clinical guardrails framing and ethics framework.
-  — voice and tone rules.
- `ETHICS.md` — root-repo ethics document (currently TBD; see  in the interim).
- `SKILL.md` — the instructions the LLM follows when this skill activates.
- `tests/` — three executable invocation contracts replayed by CI.

Licensed AGPL-3.0-or-later.
