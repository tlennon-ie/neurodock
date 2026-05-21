---
name: skill-pm-stakeholder-juggle
version: 0.1.0
description: Three PM flows — render a stakeholder map for a feature, audit decisions on a project in temporal order, or shape a verdict-first exec summary within a word budget.
neurotypes: []
status: stable
triggers:
  - phrase: "who cares about"
  - phrase: "stakeholder map for"
  - phrase: "audit my decisions on"
  - phrase: "audit decisions on"
  - phrase: "decision audit for"
  - phrase: "exec summary for"
  - phrase: "executive summary for"
mcp_dependencies:
  - server: neurodock-cognitive-graph
    tools: [recall_entity, recall_decisions]
  - server: neurodock-task-fractionator
    tools: [decompose]
profile_dependencies:
  - preferences.output_format
  - preferences.max_chunk_size
license: AGPL-3.0-or-later
authors:
  - NeuroDock contributors
---

# skill-pm-stakeholder-juggle

Three flows a product manager actually does in a week: see the political shape of a feature (who proposed it, who is blocking it, who is endorsing it), audit the decisions already made on a project so you can stop re-litigating them, and shape a verdict-first exec summary that fits inside the word budget the exec actually gave you. Trigger phrases are PM-specific by design — they do not collide with `skill-eng-manager-1on1`'s `prep my 1:1 with` or any general planning skill.

This is not a stakeholder-manipulation planner. It does not score stakeholders, rank their influence, or coach the user on how to "win them over". Stakeholder messiness is the job — the skill helps you see the shape of it, not pretend it isn't there. It is also not a performance tool: it never rates a stakeholder, never produces a "trust score", never feeds anything into HR.

## When to activate

Activate when the user's message contains one of the trigger phrases verbatim. The trigger phrase determines which of the three flows runs:

- `who cares about <feature>` / `stakeholder map for <feature>` → **Flow A: stakeholder map**.
- `audit my decisions on <project>` / `audit decisions on <project>` / `decision audit for <project>` → **Flow B: decision audit**.
- `exec summary for <topic>, max <N> words` / `executive summary for <topic>, max <N> words` → **Flow C: exec summary**.

Do not activate on partial matches (`I care about this`, `the exec wants a summary`), past tense (`I already audited that`), or third-person reports about meetings the user is not running. Do not activate if a separate skill — for example `audhd-context-recovery`, `adhd-daily-planner`, or `skill-eng-manager-1on1` — is already running its flow in this turn; let the more general skill finish.

## Flow A — stakeholder map

The user says `who cares about <feature>` or `stakeholder map for <feature>`. Goal: a map of which people proposed, blocked, or endorsed the feature, with verbatim quotes from prior facts and dates.

1. **Parse the feature name.** Everything after `about` (or after `for`) is the feature reference. Trim. Treat the parsed string verbatim — do not normalise capitalisation, do not expand abbreviations.

2. **Recall the entity.** Call `recall_entity({ "name_or_alias": "<parsed feature>" })`.

3. **Resolution check.** If `resolution.method` is `alias`, `fuzzy`, or `embedding`, surface the resolved entity name and the resolution score before continuing. Ask one question: `I read "<parsed feature>" as the entity "<resolved>" (<method> match, score <score>). Continue?` Wait for confirmation. Do not assume.

4. **If `entity` is null**, say so plainly: `No entity in the graph matches "<parsed feature>". I can still help you map stakeholders — who do you already know is involved?` Stop and wait for the user.

5. **Bucket the facts by predicate.** Read `facts[]` and partition into three buckets based on the predicate and the subject/object types:

   - **Proposed by** — facts where the predicate is `proposed`, `requested`, or `originated_in`, with a person subject. Quote `object.literal` verbatim if present.
   - **Blocked by** — facts where the predicate is `blocked_by`, `blocked`, or contains an `object.literal` starting with `blocking:`. Quote `object.literal` verbatim.
   - **Endorsed by** — facts where the predicate is `endorsed`, `approved`, `signed_off_on`, or `supports`. Quote `object.literal` verbatim.

   If a fact does not match any bucket, place it under `Other context`. Do not invent buckets.

6. **Pull related people from `related_entities`.** Any `related_entities[]` entry with `type == "person"` that is not already in a bucket gets surfaced under `Recent context`, with the relationship inferred from the predicate of the first fact linking them.

7. **Render the stakeholder map.** See "Output format — Flow A" below.

8. **Stop.** Do not propose stakeholder strategy, communication plans, or "how do you usually handle Sarah?". The map is the deliverable.

## Flow B — decision audit

The user says `audit my decisions on <project>` (or one of the equivalent triggers). Goal: a temporally ordered list of decisions already made on the project, ending with an explicit anti-rumination closing line that names the decisions as closed.

This flow exists for the OCD-prone PM who re-litigates already-made decisions in their head. The skill surfaces the closed calls; the closing line names them as closed. The user is the authority and can reopen any decision — the skill names that path too.

1. **Parse the project name.** Everything after `on` (or after `for`) is the project reference. Trim verbatim.

2. **Recall decisions.** Call `recall_decisions({ "project": "<parsed project>" })`. No `since` filter — the audit is over the full project history.

3. **Resolution check.** If the returned `project` field is null, say so plainly: `No project in the graph matches "<parsed project>". I cannot audit decisions on a project the graph does not know about.` Stop.

4. **If `decisions[]` is empty**, say so: `Project "<resolved project>" exists in the graph, but no decisions are recorded against it. There is nothing to audit.` Stop. Do not add the anti-rumination closing line — there are no decisions to close.

5. **Render the audit in temporal order.** The schema returns decisions ordered newest-first; render them newest-first. See "Output format — Flow B" below.

6. **Add the anti-rumination closing line, verbatim.** The final line of the output MUST be exactly:

   ```
   These decisions are closed. To reopen, open a new question.
   ```

   No paraphrase. No softening adjectives. No "but if you want to revisit". This line is the load-bearing piece of Flow B.

7. **Stop.** Do not propose new decisions, do not ask "shall I help you reopen any of these?", do not editorialise about whether the decisions were good ones. The audit is the deliverable.

## Flow C — exec summary

The user says `exec summary for <topic>, max <N> words` (or the `executive summary for` variant). Goal: a verdict-first, 4-bullet exec summary that respects the word budget the user named.

1. **Parse the topic and the word budget.** Split on `, max `. Everything before is the topic, the integer after is the word budget. If the user does not specify a word budget, default to 150 words and surface that default explicitly: `Defaulting to a 150-word budget. Override with "max <N> words" if you want a different cap.` Then continue.

2. **Validate the budget.** Minimum 40 words (anything shorter is a tagline, not a summary). Maximum 400 words (anything longer is not an exec summary). If the user's budget is outside this range, say so: `The exec summary budget should be 40–400 words. Restate with a budget in that range.` Stop.

3. **Call decompose.** Use the topic as the `goal` and pass a time_budget that maps to a single working block: `decompose({ "goal": "exec summary for <topic>: produce 4 atomic bullets in the order Why now / What changed / Decision needed / Risk if delayed", "time_budget": "PT30M" })`. The `decompose` call shapes the 4-bullet structure; the word budget is applied at render-time, not by the tool.

4. **Three outcomes from `decompose`:**

   - **Success** — at least 4 tasks returned. Use the first 4 in declaration order as the bullet content. Continue to step 5.
   - **Fewer than 4 tasks returned** — the topic was too small to decompose into the 4-section structure. Surface: `The topic "<topic>" did not decompose into a 4-section exec summary. Try a more specific topic, or write it freehand.` Stop.
   - **`BUDGET_INFEASIBLE` or `DECOMPOSITION_UNAVAILABLE`** — surface the error code on one line. Stop.

5. **Map the 4 tasks to the 4 sections in order:**

   - Bullet 1 → **Why now** — the timing argument. Why is this decision-worthy this week and not last month or next quarter?
   - Bullet 2 → **What changed** — the new information. Without "what changed" there is no story.
   - Bullet 3 → **Decision needed** — the explicit ask of the exec. One sentence. No hedging.
   - Bullet 4 → **Risk if delayed** — the cost of not deciding now. The other side of "Why now".

6. **Render the summary with a verdict-first opener.** First sentence is the verdict — the punchline the exec should walk away with even if they read nothing else. Then the 4 bullets. See "Output format — Flow C" below.

7. **Enforce the word budget at render-time.** Count words in the verdict + 4 bullets (not counting the section labels). If the total exceeds the budget, tighten the bullets — drop adjectives, drop hedges, drop subordinate clauses — until the word count fits. Surface the actual word count in the closing line.

8. **Stop.** Do not propose follow-up materials ("want a deck?"), do not ask "shall I send this?". The summary is the deliverable.

## Output format

### Flow A — stakeholder map

```
Stakeholder map — <feature name>.

### Proposed by
- <person name>: "<verbatim fact>" (<recorded date>)

### Blocked by
- <person name>: "<verbatim fact>" (<recorded date>)

### Endorsed by
- <person name>: "<verbatim fact>" (<recorded date>)

### Recent context
- <person name> (<relationship>)

### Other context
- "<verbatim fact>" (<recorded date>)

This map shows the political shape of the feature as the graph remembers it. Stakeholder messiness is the job, not a failure.
```

Rules:

- Sections with no facts are omitted entirely. Do not render `### Endorsed by\n(none)`.
- Maximum five bullets per section. If a section has more than five facts, surface the five most recent and append one closing line `(<M> further facts in the graph; ask for them if you want the full list.)`.
- Facts are quoted verbatim from `recall_entity`'s `facts[].object.literal`. No paraphrase.
- The closing line is mandatory.

Empty-graph fallback (used when the entity is null):

```
No stakeholder map — <feature name>. No prior context in the graph.

I can still help. Who do you already know is involved? If you'd like me to capture anything for next time, say "record this" once we're done.
```

### Flow B — decision audit

```
Decision audit — <project name>. <N> decisions on file.

1. <decision name> — decided <decided_on>. <attribution line>. <source line if non-null>.
2. <decision name> — decided <decided_on>. <attribution line>. <source line if non-null>.
3. ...

These decisions are closed. To reopen, open a new question.
```

Where:

- `<attribution line>` is `Decided by <decided_by[*].name comma-separated>` if `decided_by` is non-empty, else `Attribution: unattributed`.
- `<source line>` is `Source: <source verbatim>` if `source` is non-null, else the line is omitted.
- Decisions are numbered newest-first (matching the schema's ordering).

Rules:

- The closing line `These decisions are closed. To reopen, open a new question.` is verbatim and mandatory when at least one decision is rendered.
- Decision names are quoted verbatim from the graph. Do not paraphrase.
- If `truncated == true`, append one line before the closing line: `(More than 200 decisions on file; older entries truncated. Ask for a date range to narrow.)`

### Flow C — exec summary

```
Verdict: <one-sentence punchline, verdict-first, no preamble>.

- **Why now.** <Bullet 1 content, one to three sentences.>
- **What changed.** <Bullet 2 content, one to three sentences.>
- **Decision needed.** <Bullet 3 content, one sentence, ends with a question mark or imperative.>
- **Risk if delayed.** <Bullet 4 content, one to three sentences.>

Word count: <actual>/<budget>.
```

Rules:

- The verdict is the first thing in the output. No "Here's the summary:" preamble, no greeting, no "as requested".
- Section labels are bolded inline (`**Why now.**`), not as headers — exec summaries fit on one screen.
- The word count line is mandatory and is the user's check that the budget was respected.
- The four sections appear in the order `Why now / What changed / Decision needed / Risk if delayed`. Do not reorder.

## Distress signal handling

If the user's invoking message contains phrases like `I'm furious`, `<name> is screwing me over`, `this person is the problem`, the skill MUST acknowledge the feeling but MUST NOT shift the flow toward naming a stakeholder as the cause of anything. One sentence: `Understood. The stakeholder map still surfaces facts from the graph, not judgements. We can route the interpersonal conversation separately if you want.` Then continue with the requested flow as defined.

## Do not

- Do not score, rank, or rate any stakeholder mentioned in any flow.
- Do not produce a "trust score", "influence map weighted by power", or any quantification of stakeholders.
- Do not coach the user on stakeholder strategy ("here's how to win Sarah over"). That is a different conversation.
- Do not use middle-management speak: `synergy`, `rockstar`, `10x`, `ninja`, `growth mindset`, `stretch goal`, `should have known`, `aligned`, `north star`, `circle back`, `actionable insights`.
- Do not invent facts in Flow A. If the graph has no facts on the entity, say so.
- Do not paraphrase facts returned by `recall_entity` or decisions returned by `recall_decisions` — quote the literal text.
- Do not omit or soften the Flow B closing line. `These decisions are closed. To reopen, open a new question.` is verbatim or it does not appear.
- Do not propose new decisions in Flow B. Surfacing closed calls is the job; reopening them is the user's call.
- Do not exceed the word budget in Flow C. If you cannot fit, tighten — do not negotiate the budget.
- Do not call `record_fact` in any flow without explicit user opt-in. The cognitive graph is the user's notebook, not the skill's logbook.
- Do not activate inside another skill's flow. Let it finish first.

## What this skill is not

- Not a stakeholder-management or "stakeholder engagement strategy" tool.
- Not a performance-review prep tool.
- Not a sentiment analyser. The skill does not infer anyone's mood from their facts.
- Not a clinical tool. The anti-rumination close on Flow B is a workflow shape, not a treatment claim. The skill makes no claims about the user's neurotype.

## Examples

See `tests/`:

- `tests/01-stakeholder-map.md` — Flow A with proposers, blockers, endorsers, and one related person.
- `tests/02-decision-audit.md` — Flow B with three closed decisions and the verbatim anti-rumination closing line.
- `tests/03-exec-summary.md` — Flow C with an explicit word budget enforced at render-time.
