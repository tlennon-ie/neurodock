---
name: adhd-daily-planner
version: 0.1.0
description: Morning brief — what changed overnight, what matters today, one next-action per project.
neurotypes: ["adhd", "audhd"]
status: stable
triggers:
  - command: "/resume monday"
  - command: "/morning-brief"
  - phrase: "what's on today"
  - phrase: "plan my day"
  - phrase: "what should I do today"
mcp_dependencies:
  - server: mcp-chronometric
    tools: [get_time_context]
  - server: mcp-cognitive-graph
    tools: [weekly_rollup, recall_decisions]
  - server: mcp-task-fractionator
    tools: [next_one]
profile_dependencies:
  - identity.neurotypes
  - preferences.output_format
  - preferences.max_chunk_size
  - chronometric.end_of_day_local
license: AGPL-3.0-or-later
authors:
  - neurodock-core
---

# adhd-daily-planner

This skill produces a morning brief: what changed overnight in the user's projects, what matters today, and one concrete next-action per project. On Monday it is the full weekly stack. On other weekdays it is a lighter daily-pulse.

## Activation criteria

Activate when any of the following is true:

- The user types `/resume monday` or `/morning-brief`.
- The user's message contains one of: `what's on today`, `plan my day`, `what should I do today`, `monday morning`.
- This is the user's first interaction of a new local day AND `preferences.output_format` is `answer_first` (treat as an implicit invitation, not an obligation — see "Do not" below).

Do not activate inside a session that has already been running for more than thirty minutes; that conversation has its own context already.

## Operating instructions

Follow these steps in order. Do not skip steps. Do not improvise additional tool calls.

1. **Anchor the day.** Call `mcp-chronometric.get_time_context()`. Note `day_of_week`, `energy_zone`, and `current_session_length`. If `day_of_week` is `Monday`, this is a **weekly brief**. Otherwise it is a **daily-light brief**.

2. **Pull the weekly rollup, scoped or unscoped.**

   - For a weekly brief: call `mcp-cognitive-graph.weekly_rollup()` with no project filter to discover which projects had activity in the trailing seven days. Rank projects by the most recent `decisions[].decided_on` (falling back to most recent `blockers[].recorded_at` when there are no decisions).
   - For a daily-light brief: same call, same ranking.
   - Cap the project list at `preferences.max_chunk_size` (default 5). If more projects had activity, note the count of elided projects in the closing line — do not name them.

3. **For each retained project, get its rollup.** Call `mcp-cognitive-graph.weekly_rollup(project=<name>)` once per project. Use the returned `decisions`, `blockers`, and `next_actions` fields verbatim. Do not paraphrase decision names.

4. **Decide whether to surface decision detail.** If a project has decisions in the last seven days but `weekly_rollup.next_actions` is empty for that project, call `mcp-cognitive-graph.recall_decisions(project=<name>, since=<thirty days ago>)` once to surface up to two recent decisions that may need follow-up. Skip this call when `next_actions` is already populated.

5. **Get one concrete next-action per project.** Call `mcp-task-fractionator.next_one(project=<name>)` for each project. Three outcomes:

   - Success with `confidence >= 0.7` — quote the task title and the confidence value.
   - Success with `confidence < 0.7` — quote the title and explicitly say "low confidence" with the value. Do not pretend certainty.
   - Error `NO_TASKS_AVAILABLE` — say "no decomposed tasks for this project; consider `decompose` if it's time to plan it." Do not fabricate a task.
   - Any other error — note the error code in the project section and move on.

6. **Render the brief.** See "Output format" below.

7. **Stop.** Do not propose a calendar rearrangement, a follow-up question, or "shall I start the first task?". The brief is the deliverable.

## Output format

Strict "Answer First" structure. The first sentence must fit in 80 characters and must name the day's shape in plain prose.

```
<One paragraph, ≤ 80 chars in the first sentence, plain prose. State which day it is,
the brief type (weekly or daily-light), and the count of projects covered. No
exclamation marks. No "let's crush it" register.>

### <Project name>
- Most recent decision: <decision name> (<decided_on>, conf <confidence>)
- Blocker: <blocker literal or "none">
- Next: <next_one.task.title> (<estimated_minutes> min, conf <confidence>)

### <Project name>
- ...

---
Elided <N> further projects with activity this week.
Energy zone right now: <energy_zone>. End-of-day stated as <chronometric.end_of_day_local>.
This brief is not a productivity scorecard. Yesterday's incomplete items are not graded.
```

Rules:

- Maximum three bullets per project. If a project has no blocker, write `Blocker: none` — do not invent one.
- Project sections appear in the order produced by step 2's ranking.
- Confidence is always rendered as a number with two decimal places, never as a word.
- The closing block is mandatory. The "not a scorecard" line grounds the LLM and the user.

If `weekly_rollup()` returned zero projects in the trailing seven days, emit the empty-graph response instead:

```
No projects in the last 30 days. Nothing to brief against.

If you'd like to start one, the next step is `mark_session_start(intent=<your intent>)`
in mcp-chronometric — that anchors today and gives tomorrow's brief something to draw on.
```

## Distress signal handling

If the user's invoking message contains overwhelm phrases — `I can't`, `too much`, `everything is on fire`, `I'm stuck`, `exhausted`, `burned out` — reduce the project cap to **3** instead of `preferences.max_chunk_size`, omit the confidence numbers (state "high" / "medium" / "low" instead), and append one sentence to the closing block: `If three is still too many right now, ask for "just one project" and I'll narrow further.` Do not lecture. Do not diagnose.

## Do not

- Do not use the words "superpower", "crusher", "smash", "let's go", "you got this", "differently abled".
- Do not enumerate yesterday's incomplete items.
- Do not compute or display a productivity score.
- Do not propose calendar buffer transitions unless the user's MCP environment surfaces calendar data through a tool you can call. **Calendar integration is not in scope for v0.1.0 of this skill** — if no calendar tool is wired, omit the "buffer transitions" feature silently.
- Do not call `next_one` for a project with no decisions and no blockers — that project does not need a next-action surfaced, it needs the user to decide whether to retire it.
- Do not invent project names. Only use names that came back from `weekly_rollup`.
- Do not exceed three bullets per project even if more data exists.
- Do not activate inside an ongoing >30 min session.

## What this skill is not

It is not a productivity maximiser. It is not a guilt trip about yesterday. It is a once-a-day surface area for projects, decisions, and one tangible next thing.

## Examples

See `tests/01-monday-morning-brief.md`, `tests/02-empty-graph-fallback.md`, and `tests/03-multi-project-stack.md` for the full invocation traces.
