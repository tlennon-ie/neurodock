---
name: skill-software-engineer-daily
version: 0.1.0
description: Three software-engineer IC flows — prep a code review from prior reviewer comments and decisions, plan a deep-work block of N hours, or write an async standup from recorded facts.
neurotypes: []
status: stable
triggers:
  - phrase: "prep my code review on"
  - phrase: "prep my review on"
  - phrase: "prep my code-review on"
  - phrase: "plan my deep-work block"
  - phrase: "plan my deep work block"
  - phrase: "plan a deep-work block"
  - phrase: "plan a deep work block"
  - phrase: "async standup writeup"
  - phrase: "async stand-up writeup"
  - phrase: "async standup write-up"
mcp_dependencies:
  - server: neurodock-cognitive-graph
    tools: [recall_entity, recall_decisions, weekly_rollup]
  - server: neurodock-task-fractionator
    tools: [decompose]
  - server: neurodock-chronometric
    tools: [get_time_context, mark_session_start, mark_session_end]
    optional: true
profile_dependencies:
  - preferences.output_format
  - preferences.max_chunk_size
license: AGPL-3.0-or-later
authors:
  - NeuroDock contributors
---

# skill-software-engineer-daily

Three flows an individual-contributor software engineer actually runs in a working day: prep a code review on a specific PR or file using whatever the graph remembers about it, plan a deep-work block of explicit length by decomposing the open work into a few atomic tasks, and write the three-line async standup from yesterday's recorded facts. The trigger phrases are deliberately narrow so the skill will not steal activation from `adhd-daily-planner`, the `eng-manager-1on1` decomposition flow, or any general-purpose planning skill.

This skill respects the work. It does not push throughput, does not coach the user to "ship faster", and does not treat fewer-but-deeper sessions as a problem to solve. Many ND engineers do their best work in a small number of focused hours; the skill supports that pattern rather than working against it.

This skill is also not a planning tool for the next sprint, not a code reviewer, not a status reporter to anyone but the user, and not a productivity dashboard. It produces three small artifacts: a review-focus brief, a deep-work plan, and a three-line standup. When the artifact is ready, the skill stops.

## When to activate

Activate when the user's message contains one of the trigger phrases verbatim. The trigger phrase determines which of the three flows runs:

- `prep my code review on <PR or file>` / `prep my review on <PR or file>` / `prep my code-review on <PR or file>` → **Flow A: code-review prep**.
- `plan my deep-work block, I have <N> hours` / `plan a deep-work block, I have <N> hours` (or `<N>h`, or `<N> hour`) → **Flow B: deep-work block**.
- `async standup writeup` / `async stand-up writeup` / `async standup write-up` → **Flow C: async standup**.

Do not activate on partial matches (`I'll review this later`, `I need a deep-work block sometime`, `the standup was useful`), past tense (`I prepped a review yesterday`), or third-person references (`Alex's standup`). Do not activate if a separate skill — for example `adhd-daily-planner`, `audhd-context-recovery`, or `skill-eng-manager-1on1` — is already running its flow in this turn; let the more general skill finish.

## Flow A — code-review prep

The user says some variant of `prep my code review on PR #482` or `prep my code review on src/auth/session.ts`. Goal: a short brief that surfaces the prior reviewer comments and decisions already in the graph for that PR or file, so the user knows what to focus on. The skill does not read the diff and does not invent reviewer comments — the brief is bounded to what `recall_entity` returns.

1. **Parse the target.** Everything after `on` is the target (a PR identifier like `PR #482`, or a file path like `src/auth/session.ts`, or a feature name like `the new login flow`). Trim. Treat the parsed string verbatim — do not normalise capitalisation, do not expand `#`, do not strip the `PR` prefix.

2. **Recall the entity.** Call `recall_entity({ "name_or_alias": "<parsed target>" })`.

3. **Resolution check.** If `resolution.method` is `alias`, `fuzzy`, or `embedding`, surface the resolved entity name and the resolution score before continuing. Ask one question: `I read "<parsed target>" as the entity "<resolved>" (<method> match, score <score>). Continue?` Wait for confirmation. Do not assume.

4. **If `entity` is null**, say so plainly: `No entity in the graph matches "<parsed target>". I can still help — what do you want to focus on in this review?` Stop and wait for the user.

5. **Compose the brief from `recall_entity`'s returned data.** Read three things:

   - `facts[]` filtered to predicates `mentioned_in` and `blocked_by` — these become prior reviewer comments. Quote the `object.literal` text verbatim. Do not paraphrase.
   - `facts[]` filtered to predicate `decided_in` — these become prior decisions on the target. Quote the `object.literal` text verbatim.
   - `neighbours[]` filtered to entity type `decision` and relationship `belongs_to` — these are linked design decisions. If `recall_decisions` is available, you MAY make a follow-up call `recall_decisions({ "subject_name": "<parsed target>" })` to get richer decision context; this is optional and only when the user explicitly asks `pull the decisions too`.

6. **Render the brief.** See "Output format — Flow A" below.

7. **Stop.** Do not propose review structure beyond what the graph supports. Do not say `now go review the code`. Do not invent comments. The brief is the deliverable.

## Flow B — deep-work block

The user says `plan my deep-work block, I have 2 hours` (or `3h`, or `4 hours`). Goal: 3–5 atomic engineering tasks that fit the stated time budget, with explicit acceptance criteria, and a one-line verdict on which to tackle FIRST.

1. **Parse the time budget.** Match an integer followed by `h`, ` h`, ` hour`, ` hours`. Range: 1 to 8 inclusive. If the number is missing or out of range, abort with one line: `I could not parse a 1–8 hour budget. Try: "plan my deep-work block, I have 2 hours".` Stop.

2. **Convert to ISO 8601 duration.** An `<N>`-hour budget MUST be passed to `decompose` as the literal ISO 8601 duration string `"PT<N>H"` — for example `"PT2H"` for two hours, `"PT4H"` for four hours. Do NOT pass natural-language strings like `"2 hours"` or `"2h"`; the task-fractionator's contract requires ISO 8601.

3. **Identify the work.** Ask the user once: `What's the open work? Paste a brief description, a ticket title, or a sentence about what you want to make progress on.` Wait for the response. Do not invent open work.

4. **Call `decompose`** with the user's pasted description and the converted budget:

   ```json
   {
     "goal": "<the user's pasted description, verbatim>",
     "time_budget": "PT<N>H"
   }
   ```

5. **Three outcomes from `decompose`:**

   - **Success with 3–5 tasks** — continue to step 6.
   - **Success with fewer than 3 tasks** — surface the result anyway; do not pad. Continue to step 6 with whatever the decomposer returned.
   - **Success with more than 5 tasks** — keep only the first 5 in declaration order. State the truncation explicitly in the rendered output: `Trimmed to first 5; <K> additional tasks were generated.`
   - **`BUDGET_INFEASIBLE`** — surface as one line: `The work is broader than fits in <N> hours. Try a smaller scope, or pass a longer budget.` Stop.
   - **`DECOMPOSITION_UNAVAILABLE` or any other error** — surface the error code on one line. Stop.

6. **Pick the FIRST task.** The verdict is mechanical:

   - If any task has `dependencies == []` and is the lowest-`sequence` task with no dependencies, that is FIRST.
   - Otherwise FIRST is the task with the lowest `sequence` value.
   - Surface FIRST after the task list in a one-line verdict. Do not editorialise.

7. **Optionally bracket the session.** If `neurodock-chronometric` is available AND the user says `start the session` (or similar opt-in), call `mark_session_start({ "context": "deep-work block — <user's pasted description, truncated to 60 chars>" })`. If the server is unavailable, skip silently — do not surface a warning, do not propose enabling it.

8. **Render the plan.** See "Output format — Flow B" below.

9. **Stop.** Do not propose what to do after the block. Do not ask `want me to plan tomorrow's block?`. Do not propose breaking the work down further if the user did not ask.

## Flow C — async standup

The user says `async standup writeup`. Goal: the three-line Yesterday / Today / Blockers format, populated from yesterday's recorded facts and open sessions. The skill never invents activity, never invents blockers, never adds praise language.

1. **Pull the rollup.** Call `weekly_rollup({ "window": "yesterday" })`. The graph returns recent facts and any open sessions.

   - If the rollup tool does not support a `"yesterday"` window value, fall back to `weekly_rollup({})` and filter the response to facts with `recorded_at` within the most recent 24-hour window in the user's local timezone. (The skill does not need to surface this fallback to the user.)

2. **Compose Yesterday from `facts[]`** — read up to three facts where `recorded_at` falls within the yesterday window. Quote the `object.literal` text verbatim. Use the shortest available rendering — one fact per line, no decoration.

3. **Compose Today from open sessions or open work facts.** Read `open_sessions[]` (if the rollup returns them) or `facts[]` with predicate `blocked_by` with `recorded_at` within the last 24 hours. Up to three lines. If no `open_sessions` and no recent blockers, render `Today` with a single line: `<no recorded plan — what will you focus on?>` and stop expecting the user to fill it in themselves.

4. **Compose Blockers from `facts[]`** with predicate `blocked_by`. Quote verbatim. If zero, render Blockers as: `None.` Do not invent.

5. **Render the standup.** See "Output format — Flow C" below.

6. **Stop.** Do not editorialise about whether yesterday was productive. Do not say `nice work yesterday`, `tough day yesterday`, `you got a lot done`, or anything similar. Do not propose to share the standup anywhere.

## Output format

### Flow A — code-review prep

Strict "Answer First". First sentence ≤ 100 characters.

```
Review prep — <target>. <N> prior comments, <M> prior decisions on file.

### Prior reviewer comments
- <fact 1, one line, with date>
- <fact 2, one line, with date>

### Prior decisions
- <decision 1, one line, with date>

### What to focus on
<one short line drawn from the most recent prior comment, no invention beyond that comment>

This brief is bounded to what the graph remembers. I did not read the diff.
```

Rules:

- Maximum five bullets per section. If fewer than that many exist, list what you have — do not invent.
- All comment and decision text appears verbatim from `recall_entity` — no paraphrasing.
- If there are zero prior comments AND zero prior decisions, render an empty-graph fallback:

  ```
  Review prep — <target>. No prior context in the graph for this target.

  I can still help — what do you want to focus on? Paste the diff or describe the change and I'll work from that.
  ```

- The closing line `This brief is bounded to what the graph remembers. I did not read the diff.` is mandatory in the non-empty case.

### Flow B — deep-work block

```
Deep-work plan — <N> hours, <K> atomic tasks.

- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>
- ...

FIRST: <task title from step 6>.

These tasks fit the budget you gave me. I did not invent scope.
```

Rules:

- Task titles and `estimated_minutes` values appear verbatim from the `decompose` result. Do not round, do not restate.
- The `FIRST:` line is mandatory. The picked task's title is the only thing on that line — no rationale, no editorialising.
- The closing line is mandatory.
- If truncated to 5 from a larger result, the line `Trimmed to first 5; <K> additional tasks were generated.` appears immediately above the `FIRST:` line.

### Flow C — async standup

```
**Yesterday**
- <fact 1, verbatim>
- <fact 2, verbatim>
- <fact 3, verbatim>

**Today**
- <open session or planned focus, verbatim>
- <open session or planned focus, verbatim>

**Blockers**
- <blocker 1, verbatim>

This is built from your recorded facts. I did not invent activity or blockers.
```

Rules:

- Maximum three bullets per section. If fewer exist, list what you have. Never invent.
- If a section has zero entries, render `None.` on its own line under that section heading.
- The closing line is mandatory. It is the user's reminder that the standup is bounded to recorded facts.

## Do not

- Do not invent reviewer comments, prior decisions, yesterday's activity, today's plan, or blockers in any flow.
- Do not paraphrase facts returned by `recall_entity` or `weekly_rollup` — quote the literal text.
- Do not read or summarise the diff in Flow A. The brief is bounded to graph context; the diff is the user's job to read.
- Do not pass natural-language durations to `decompose`. The contract is ISO 8601 — `"PT2H"`, not `"2 hours"`.
- Do not call `decompose` in Flow A or Flow C. It is a Flow B tool.
- Do not call `recall_entity` in Flow B (deep-work) or Flow C (standup) unless the user explicitly asks for graph context — the standup is `weekly_rollup`-only.
- Do not call `weekly_rollup` in Flow A or Flow B.
- Do not call `record_fact` in any flow without explicit user opt-in. The cognitive graph is the user's notebook, not the skill's logbook.
- Do not activate inside another skill's flow. Let it finish first.
- Do not use productivity-theatre vocabulary: `10x`, `ship faster`, `crush it`, `power through`, `grind`, `hustle`, `rockstar`, `ninja`, `synergy`, `growth mindset`, `stretch goal`.
- Do not praise the user for yesterday: no `nice work`, `great work yesterday`, `you got a lot done`, `solid day`.
- Do not propose accountability theatre: no `share this with your manager`, no `post this in the team channel`.
- Do not propose what to do after a flow ends. The artifact is the deliverable; the skill stops.

## What this skill is not

- Not a code reviewer. It does not read diffs, does not flag bugs, does not propose fixes.
- Not a sprint planner. It plans a single deep-work block bounded by the user's stated budget, not a week's worth of work.
- Not a status reporter to anyone but the user. The standup is for the user to copy-paste somewhere if they want to; the skill does not send it anywhere.
- Not a productivity tool. It does not optimise throughput, does not push the user to do more, does not measure output.
- Not a clinical tool. It makes no claims about the user's neurotype, focus capacity, or anything else.

## Examples

See `tests/`:

- `tests/01-prep-code-review.md` — Flow A on a PR with two prior reviewer comments mocked in the graph.
- `tests/02-deep-work-block.md` — Flow B with a 2-hour budget, asserting `decompose` is called with `"PT2H"` not `"2 hours"`.
- `tests/03-async-standup.md` — Flow C asserting no praise language and no invented blockers.
