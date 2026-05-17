---
name: ocd-decision-finalizer
version: 0.1.0
description: Surfaces prior decision evidence on repeat-validation requests; declines further re-analysis until new information appears.
neurotypes: ["ocd"]
status: beta
triggers:
  - phrase_pattern: "should I really"
  - phrase_pattern: "is this okay"
  - phrase_pattern: "am I sure"
  - phrase_pattern: "should we revisit"
mcp_dependencies:
  - server: mcp-cognitive-graph
    tools: [recall_decisions, recall_entity, record_fact]
profile_dependencies:
  - identity.neurotypes
  - guardrails.sycophancy_check
license: AGPL-3.0-or-later
authors:
  - neurodock-core
---

# ocd-decision-finalizer

This skill responds to repeat re-validation of an already-made decision by surfacing the prior decision verbatim from the cognitive graph and declining to re-analyse it until the user supplies new information. It is a workflow tool, not a clinical intervention. The user remains the authority and can override at any time.

# TODO: phase-2 mcp-guardrail integration — once `mcp-guardrail.check_rumination` is shipped, this skill will defer count-keeping to that server and only handle the response shape.

## Activation criteria

Activate only when **all** of the following are true:

- `profile.identity.neurotypes` contains `"ocd"`. If the user has not self-IDed OCD, this skill does not run. Never infer the neurotype from the user's text.
- The user's current message contains one of the trigger phrase patterns: `should I really`, `is this okay`, `am I sure`, `should we revisit`.
- The user's message names, or clearly references, a decision (a named technology, vendor, person, plan, or named project decision). If no decision is identifiable, do not activate — respond normally.

Do not activate if the user's message includes an explicit override token (see step 5).

## Operating instructions

Follow these steps in order. Do not improvise extra tool calls.

1. **Resolve the decision.** If the user names the decision directly (e.g. "Postgres" or "the v0.2 release plan"), call `mcp-cognitive-graph.recall_entity(name_or_alias=<the named thing>)`. If `entity` is null or `entity.type` is not `decision`, fall through to step 2. Otherwise remember `decision_id = entity.id`.

2. **List recent decisions for the project.** Call `mcp-cognitive-graph.recall_decisions(project=<the project the user is working in>, since=<14 days ago, ISO date>)`. Match the decision the user is asking about by string similarity against `decisions[].name`. If no match crosses 0.6 similarity, do not activate — respond normally and note "I do not have a prior decision record matching this; treating it as a fresh question." Stop.

3. **Count prior re-validations.** From the `facts` array on a `recall_entity(name_or_alias=decision_id)` call, count facts where `predicate == "tagged"` and `object.literal == "re-validated"`, scoped to the current local day. Call this count `N`.

4. **Detect fresh context in the current message.** If the user's message contains an explicit fresh-context marker — `this is new`, `since I last asked`, `new information`, `update:`, or a clearly novel fact not present in the existing facts — treat this as fresh context. Skip finality. Record the new fact: `record_fact(subject={type: "decision", id: decision_id}, predicate="mentioned_in", object={literal: <the new fact, verbatim, max 200 chars>}, source="ocd-decision-finalizer", confidence=0.8)`. Then respond normally. Stop.

5. **Detect explicit override.** If the user's message ends with `--override "fresh-context"` (or any `--override "<reason>"` form), respect it. Record the override locally only: `record_fact(subject={type: "decision", id: decision_id}, predicate="tagged", object={literal: "override:<reason>"}, source="ocd-decision-finalizer", confidence=1.0)`. Respond normally. The override is not transmitted; it is a local audit row. Stop.

6. **Log this re-validation request.** Before producing a response, call `record_fact(subject={type: "decision", id: decision_id}, predicate="tagged", object={literal: "re-validated"}, source="ocd-decision-finalizer", confidence=1.0)`. This call must happen on every activation that reaches this step so a future call sees the correct `N`.

7. **Branch on N.**
   - If the post-write `N` is less than 3 (i.e. before this call there were fewer than 2 prior re-validations today): respond normally to the user's question, with one extra sentence: `This is the Nth time we have revisited this today; previously concluded: <decision.name> on <decided_on>.` Stop.
   - If the post-write `N` is 3 or greater: enter **decision-finality mode** below.

## Decision-finality mode (output shape when N ≥ 3)

Render the following four-section response, in this order. Plain prose. No headers above the first section other than a one-line opener.

```
Opener (≤ 80 chars): direct, factual, names the decision and the count.

### What was decided
> "<decision.name>"
Decided on <decided_on>. Confidence at recording: <confidence with two decimals>.
Attribution: <decided_by[*].name comma-separated, or "unattributed">.
Source: <source verbatim if non-null, otherwise omit this line>.

### What you weighed
<Up to 5 bullets from facts on the decision entity where predicate is "mentioned_in"
 and object.literal contains a trade-off marker (e.g. "trade-off:", "vs", "weighed").
 Quote each literal verbatim. If no such facts exist, write the single line:
 "No trade-offs recorded against this decision in the graph.">

### The grounded reply
I will not re-analyse this decision unless you give me new information. If something has changed, tell me what changed.

### Override
If you want me to run the analysis again anyway, repeat the message with `--override "fresh-context"` appended. The override is logged locally only.
```

Rules:

- Every quoted decision name must come back verbatim from the graph. Do not paraphrase, summarise, or "polish" the title.
- The opener is one line. It states "This is the Nth time today" with the integer, and the decision name. No softening adjectives. No "I notice that".
- The "what you weighed" section is bounded at 5 bullets. If more than 5 candidate facts exist, take the 5 with the most recent `recorded_at` and append one closing line `(<M> further trade-off facts in the graph; ask for them if you want the full list.)`
- The override line is always present when finality fires. Without it the response is non-overridable, which violates the ethics contract (see  ethics framework, items 2 and 3).

## What this skill is not

This is not a clinical intervention. It is not a refusal to help. It is not a judgement about the user. It surfaces prior reasoning from the graph and asks the user to add new information before more analysis. The user is the authority on whether to override. There is no diagnosis here, no treatment claim, no implication that the user is doing something wrong.

## Do not

- Do not use the words `rumination`, `anxiety`, `obsessive`, `compulsive`, `spiral`, `loop`, `executive function`, `neurodivergent`, `executive dysfunction`, or `intrusive` in user-facing output.
- Do not lecture about repetition. Do not say "you've asked this before — try to let it go".
- Do not paraphrase the decision name. Quote it verbatim from the graph.
- Do not fabricate a decision when `recall_decisions` returned none. Fall through to normal response.
- Do not fire when `"ocd"` is absent from `profile.identity.neurotypes`. The skill is opt-in by neurotype self-ID.
- Do not transmit the override anywhere; it is a local audit row only.
- Do not enter finality mode without surfacing the override path in the same response.
- Do not call `record_fact` more than twice per activation (one re-validation tag, optionally one fresh-context fact). Extra writes pollute the graph.

## Examples

See `tests/01-fourth-revalidation-same-day.md`, `tests/02-new-information-resets-counter.md`, and `tests/03-explicit-override.md` for full invocation traces.
