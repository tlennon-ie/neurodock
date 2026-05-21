---
name: skill-writer-long-form
version: 0.1.0
description: Three long-form-writing flows — plan a writing block as scene-shaped atomic tasks, recall what the graph remembers about a character or source, or check whether you are ruminating on a chapter.
neurotypes: []
status: stable
triggers:
  - phrase: "plan today's writing block,"
  - phrase: "plan today's writing block "
  - phrase: "plan tomorrow's writing block,"
  - phrase: "plan tomorrow's writing block "
  - phrase: "plan my writing block,"
  - phrase: "plan my writing block "
  - phrase: "who is "
    note: "only when the trailing string resolves to a single noun phrase, not a generic question like 'who is the audience'"
  - phrase: "who's "
    note: "same constraint as 'who is'"
  - phrase: "am I ruminating"
  - phrase: "am i ruminating"
  - phrase: "i keep editing chapter"
  - phrase: "I keep editing chapter"
  - phrase: "keep rewriting chapter"
mcp_dependencies:
  - server: neurodock-task-fractionator
    tools: [decompose]
  - server: neurodock-cognitive-graph
    tools: [recall_entity, record_fact]
  - server: neurodock-guardrail
    tools: [check_rumination]
    optional: true
profile_dependencies:
  - preferences.output_format
  - preferences.max_chunk_size
  - guardrails.rumination_window_minutes
  - guardrails.rumination_threshold
license: AGPL-3.0-or-later
authors:
  - NeuroDock contributors
---

# skill-writer-long-form

Three flows a writer working on something long — an essay, a chapter, a novel, a technical book, a dissertation, a screenplay — actually does inside a working session: plan a writing block in scene-shaped atomic tasks for the next N hours, ask the graph who a character or source or concept is from prior notes, and check honestly whether they are stuck in a re-edit loop on a chapter that should already be closed. The trigger phrases are unambiguous on purpose — they will not steal activation from `adhd-daily-planner`, the `skill-eng-manager-1on1` decomposition flow, or any general planning skill.

This skill respects the slowness of real writing. It does not measure success in words per hour. It does not call editing "polishing" or praise re-revisiting a closed chapter as care for the craft. When the rumination check fires, it returns a hard, verbatim closing line and refuses to "take another look".

## When to activate

Activate when the user's message contains one of the trigger phrases verbatim. The trigger phrase determines which of the three flows runs:

- `plan today's writing block, <N> hours` / `plan tomorrow's writing block, <N> hours` / `plan my writing block, <N> hours` → **Flow A: writing-block planner**.
- `who is <name>` / `who's <name>` → **Flow B: recall character/source/concept**.
- `am I ruminating` / `I keep editing chapter <N>, am I ruminating` / `keep rewriting chapter <N>` → **Flow C: rumination check**.

Do not activate on partial matches (`thinking of planning a writing block`), past tense (`I planned a writing block yesterday`), or generic questions (`who is the target reader`). Do not activate if another skill — for example `adhd-daily-planner` or `ocd-decision-finalizer` — is already running its flow in this turn; let it finish.

## Flow A — writing-block planner

The user says some variant of `plan today's writing block, 3 hours`. Goal: a list of scene/section-shaped atomic tasks sized to the time budget. The output is NOT word-count goals. Word counts are a content-mill metric and an anti-pattern for writers in actual flow — see "Do not" below.

1. **Parse the time budget.** Match an integer (or decimal like `1.5`) followed by `hour`, `hours`, `hr`, or `hrs`. Multiply by 60 to get minutes. Render as ISO 8601 duration: `PT<minutes>M` (e.g. `PT180M` for 3 hours, `PT90M` for 1.5 hours). If no time budget is parseable, ask one short question: `How many hours? I'll plan the block around that.` Wait. Do not assume a default.

2. **Optionally identify the project context.** If the user's prompt mentions a project, chapter, or working title (e.g. `for chapter 4`, `on the cache-invalidation essay`), capture it verbatim as `project_context`. If absent, leave it empty — do not invent.

3. **Call `decompose`** with a writing-shaped goal. Verbatim:

   ```
   Writing block planning for: <project_context, or "the user's current long-form work in progress">. Time budget: <human-readable form, e.g. "3 hours">. Break this into scene-shaped or section-shaped atomic tasks — for example "draft scene 3: kitchen confrontation", "outline the counter-argument in section 4", "revise the opening paragraph of chapter 2 for voice". Each task should be a concrete, finite piece of writing or a discrete revision pass. Do NOT generate word-count goals (e.g. "write 500 words"). Do NOT invent scene titles, character names, plot points, or section headings; if specifics are missing, generate generic shaped tasks ("draft the next scene", "revise the previous section") instead.
   ```

   Pass `time_budget: "PT<minutes>M"` as computed in step 1.

4. **Three outcomes from `decompose`:**

   - **Success** — a list of atomic tasks, each with at least one acceptance criterion. Continue to step 5.
   - **`BUDGET_INFEASIBLE`** — surface the error message as one line: `That time budget is shorter than the smallest atomic writing task. Try a longer block, or pick one specific scene to draft.` Stop.
   - **`DECOMPOSITION_UNAVAILABLE` or any other error** — surface the error code on one line. Stop.

5. **Render the task list.** See "Output format — Flow A" below.

6. **Stop.** Do not propose a word-count goal, do not propose a "stretch" task, do not editorialise on whether the budget is "ambitious" or "realistic". The task list is the deliverable.

## Flow B — recall character/source/concept

The user says `who is Marlene` (a character), `who is Pollan` (a source), or `who is the unreliable narrator` (a concept). Goal: surface what the graph remembers about the entity, including internal contradictions the user has accidentally introduced across earlier sessions.

1. **Parse the entity reference.** Everything after `who is` or `who's` is the entity. Trim. Treat verbatim — do not normalise capitalisation, do not strip articles (`the unreliable narrator` stays as written).

2. **Refuse generic questions.** If the parsed string is one of `the audience`, `the reader`, `my reader`, `the target reader`, `the protagonist`, `the antagonist`, `the narrator` (unqualified), respond with one line: `That's a generic question. I can recall a specific named character, source, or concept from the graph — ask "who is <name>".` Stop.

3. **Call `recall_entity`** with `name_or_alias: "<parsed entity>"`.

4. **Resolution check.** If `resolution.method` is `alias`, `fuzzy`, or `embedding`, surface the resolved entity name and the resolution score before continuing. Ask one question: `I read "<parsed>" as the entity "<resolved>" (<method> match, score <score>). Continue?` Wait for confirmation. Do not assume.

5. **If `entity` is null**, say so plainly: `No entity in the graph matches "<parsed>". If this is a new character/source, you can write them now and capture notes as you go.` Stop.

6. **Compose the recall from `recall_entity`'s returned data.** Read:

   - `entity.type` — `person` for characters and real-world sources, `concept` for thematic concepts or unnamed roles.
   - `facts[]` — every fact whose `subject` is this entity. Quote the literal text verbatim. Sort by `recorded_at` ascending so older notes come first and the user can see the timeline.
   - `neighbours[]` — connected projects, chapters, or other entities.

7. **Detect internal contradictions.** Walk the `facts[]` array and look for pairs whose `object.literal` strings contain a numeric or short-form descriptor (height, age, hair colour, town of origin, profession, year of an event) that disagrees. The detection rule is intentionally simple in v0.1.0: a pair of facts is flagged when both contain a matching predicate keyword from this list — `height`, `age`, `tall`, `years old`, `feet`, `metres`, `cm`, `eyes`, `hair`, `from`, `born in`, `married to`, `works at`, `chapter` — and their literal strings differ in the numeric or short-form part of that match. If a contradiction is detected, list it explicitly in the output. Do NOT smooth over.

8. **Render the recall.** See "Output format — Flow B" below.

9. **Stop.** Do not propose new scene ideas, do not propose character arcs, do not summarise the entity in a sentence the user did not write. The recall is bounded to what is in the graph.

## Flow C — am I ruminating

The user says `I keep editing chapter 4, am I ruminating?` (or one of the equivalent triggers). This is the load-bearing ND-supportive flow. The skill MUST defer the detection to the guardrail server, MUST NEVER re-open a previously-closed chapter for "another look", and MUST return the verbatim closing line below when rumination is detected.

1. **Parse the chapter reference.** Match an integer (or `prologue` / `epilogue` / `intro` / `conclusion`) after `chapter`. If no chapter reference is found, ask one short question: `Which chapter?` Wait. Do not assume.

2. **Check guardrail availability.** If `neurodock-guardrail` is not available in this session, respond with the verbatim line: `The rumination check requires the neurodock-guardrail server, which is not available here. I will not fabricate a check. If you want the answer, install the guardrail server; in the meantime, treat the urge to re-edit as the signal.` Stop.

3. **Call `check_rumination`.** The caller (this skill) is responsible for assembling the `history` argument — recent prior prompts from the same user that reference the same chapter. The skill SHOULD source the history from prior turns in the current session plus, optionally, any graph-recorded prompts tagged to this chapter. Window: 90 minutes by default, or `profile.guardrails.rumination_window_minutes` if set. Threshold: 3 by default, or `profile.guardrails.rumination_threshold` if set.

   Call shape:

   ```json
   {
     "current_prompt": "<the user's invoking message, verbatim>",
     "history": [
       /* prior prompts referencing this chapter, oldest-first */
     ],
     "window_minutes": 90,
     "threshold_count": 3
   }
   ```

4. **Three response paths:**

   - **`detected: true`** — Go to step 5 (the load-bearing path). This is the path the test asserts.
   - **`detected: false`** — Respond plainly: `No rumination pattern detected on chapter <N>. <count> matching prompts within the window, threshold is <threshold>. Carry on.` Stop. Do not editorialise.
   - **Error from `check_rumination`** — Surface the error code on one line. Stop.

5. **Render the rumination-detected output.** Strict structure. The closing line is verbatim and load-bearing.

   ```
   Rumination pattern detected on chapter <N>. <count> near-identical prompts within <window_minutes> minutes, threshold <threshold>.

   Confidence: <confidence rounded to 2 decimals>. Heuristic: <heuristic.name> v<heuristic.version>.

   Chapter <N> is in the can. Open a new question if there is a NEW concern, or move to Chapter <N+1>.
   ```

   The literal sentence `Chapter <N> is in the can. Open a new question if there is a NEW concern, or move to Chapter <N+1>.` MUST appear verbatim as the final line of the response. The `<N>` is substituted; the `<N+1>` is the next integer. For `prologue` substitute `Chapter 1`; for the final chapter / `epilogue` substitute `the next project`.

6. **Do NOT offer to re-validate.** The skill MUST NOT follow the closing line with `unless you'd like me to take another look`, `but if you want I can review it again`, or any equivalent. The flow ends at the closing line. The user has overrides on the guardrail server side (`override-once`, `fresh-context`, etc.) if they need to escape — surfacing those overrides in this skill would defeat the point.

7. **Stop.** Hard stop. Do not propose related questions. Do not ask "anything else?". Do not soften.

## Output format

### Flow A — writing-block planner

Strict "Answer First". First sentence ≤ 100 characters.

```
Writing block — <human time budget>. <N> atomic tasks.

### Tasks
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>
- ...

These tasks are shaped to the time you have. Word counts are not in the plan, on purpose.
```

Rules:

- Task titles and estimates appear verbatim from the `decompose` result. Do not paraphrase.
- The closing line `These tasks are shaped to the time you have. Word counts are not in the plan, on purpose.` is mandatory and verbatim.
- The estimated minutes per task SHOULD sum to within 10 minutes of the budget. If they don't, do not silently re-balance — that is the task-fractionator's job. Surface the discrepancy with one extra line at the end: `Note: tasks sum to <sum> min vs <budget> min budget.`

### Flow B — recall character/source/concept

```
<entity name> — <entity.type>. Last note recorded: <relative timestamp>.

### What the graph remembers
- <fact 1, literal, with date>
- <fact 2, literal, with date>
- <fact 3, literal, with date>
- ...

### Connected
- <neighbour 1: project/chapter/entity> (<relationship>)
- <neighbour 2: project/chapter/entity> (<relationship>)

### Internal contradictions
- <fact A literal> vs <fact B literal> — these disagree on <descriptor>. Pick one.

These are the notes you've recorded. I have not invented anything.
```

Rules:

- Facts appear verbatim from `recall_entity` — never paraphrased.
- The `### Internal contradictions` section is omitted entirely when no contradictions are detected. When it is present, list every detected pair; do not summarise multiple contradictions into one line.
- The closing line `These are the notes you've recorded. I have not invented anything.` is mandatory.
- Maximum five facts in `### What the graph remembers` — if more exist, list the five most recent and append one line: `(<M> older notes not shown — call "who is <entity>" with no limit to see all.)` Note: v0.1.0 has no "no limit" call; the line is a hook for v0.2.

Empty-graph fallback (used when the entity is null or has no facts):

```
<entity name> — no notes recorded yet. Write them as you go; the graph will remember next time.
```

### Flow C — am I ruminating

See step 5 of Flow C above. The closing line is verbatim and the response stops there.

When the result is `detected: false`:

```
No rumination pattern detected on chapter <N>. <count> matching prompts within the window, threshold is <threshold>. Carry on.
```

## Do not

- Do not measure success in words/hour, words/day, or "pages per session". Word counts are a content-mill metric. The skill operates on time budgets and discrete tasks.
- Do not output the words `productivity`, `optimise`, `streamline`, `crush`, `power through`, `flow state` (as praise), `writer's block` (as diagnosis), `polish` (as a euphemism for re-editing), `wordsmith`, `prolific`.
- Do not call editing a virtue when the rumination check fires. The closing line is the closing line.
- Do not invent character names, plot points, scene titles, source citations, or any specific in Flow A. Generic shaped tasks only.
- Do not paraphrase facts returned by `recall_entity` — quote the literal text.
- Do not smooth over internal contradictions in Flow B — name them explicitly. Ambiguity is the user's craft choice, not the skill's job to resolve.
- Do not surface the guardrail's `override_options` list in Flow C. The user knows their overrides; surfacing them in the closing-line moment turns the redirect into a negotiation.
- Do not offer to "take another look" at a chapter the rumination check just closed.
- Do not propose remediation, encouragement, or "you got this" framing in any flow.
- Do not call `decompose` in Flow B or Flow C.
- Do not call `recall_entity` in Flow A or Flow C.
- Do not call `check_rumination` in Flow A or Flow B.
- Do not call `record_fact` without explicit user opt-in. The cognitive graph is the user's notebook, not the skill's logbook.
- Do not activate inside another skill's flow.

## What this skill is not

- Not a word-count tracker. Word counts are not in the plan, on purpose.
- Not a writing coach. It does not give feedback on prose, voice, structure, or arc.
- Not a productivity hack. It does not help anyone write faster.
- Not a summarisation tool. It does not generate plot summaries, character summaries, or chapter abstracts.
- Not a clinical tool. The skill makes no claims about the user's neurotype. The rumination check is a heuristic that is generally useful to any writer who edits the same chapter for the fifth time in a week.
- Not a publisher's deadline tracker. It plans the working block in front of the user, not a calendar.

## Examples

See `tests/`:

- `tests/01-plan-writing-block.md` — Flow A with a 3-hour budget, no specific project context.
- `tests/02-who-is-character.md` — Flow B recalling a character with two facts and one detected contradiction.
- `tests/03-rumination-on-chapter.md` — Flow C with the rumination heuristic firing; asserts the verbatim closing line and asserts the skill does NOT offer to re-validate.
