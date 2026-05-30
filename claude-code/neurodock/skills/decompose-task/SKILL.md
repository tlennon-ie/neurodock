---
name: decompose-task
description: Break a vague goal into 3–12 atomic 5–90 minute tasks with acceptance criteria and dependencies via the NeuroDock task-fractionator. The acceptance bar is "I can start now".
---

# decompose-task

Wrapper for the `decompose` tool on the local NeuroDock task-fractionator
server (`neurodock-task-fractionator`). Takes a goal and returns an ordered
list of atomic tasks the user can pick up cold.

Design rationale: [ADR 0003 — task-fractionator tool design](https://github.com/tlennon-ie/neurodock/blob/main/docs/decisions/0003-task-fractionator-tool-design.md)
("goblin-style" decomposition; acceptance bar is _I can start this right
now without thinking_).

## When to use

- The user states a goal that is bigger than a single task ("ship the
  founding-scope RFC by Friday").
- A planner skill needs structured sub-tasks to schedule.
- The user is staring at a vague item and cannot start.

Do NOT use for:

- Tasks already small enough (a single email reply).
- Strategic planning over weeks/months — this tool caps total
  estimated_minutes at the decompose-level budget, not a roadmap.

## What it does

Calls `mcp__neurodock-task-fractionator__decompose`. The server:

1. Decomposes the goal into 3–12 atomic tasks (hard cap 20).
2. Each task gets: `id` (UUIDv4), `title`, `description`,
   `estimated_minutes` (5–90), `acceptance_criteria[]` (≥1),
   `dependencies[]` (refs to sibling ids), `sequence` (1-indexed total
   order), `tags[]`.
3. Returns the `tasks` array plus a `rationale` paragraph explaining the
   split.
4. Does **NOT** persist anything — the caller is responsible for writing
   the result to the cognitive graph (see the `record-fact` skill) if
   persistence is desired.

## How to invoke

Minimal:

```json
{
  "goal": "ship the founding-scope RFC by Friday"
}
```

With a time budget (ISO 8601 duration — natural language is rejected):

```json
{
  "goal": "fix the chronometric idle-status consent bug",
  "time_budget": "PT3H"
}
```

Common `time_budget` values:

- `PT30M` — 30 minutes
- `PT3H` — 3 hours
- `PT1H30M` — 1 hour 30 minutes
- `P1D` — 1 day
- `P3D` — 3 days

If the budget cannot fit a credible task list, the server returns
`BUDGET_INFEASIBLE` rather than silently truncating.

## Output shape (excerpt)

```json
{
  "tasks": [
    {
      "id": "c1e4d2a8-7b3f-4f9a-9c1e-2d3a4b5c6d7e",
      "title": "Draft the manifesto section",
      "description": "Write the manifesto section covering ...",
      "estimated_minutes": 45,
      "acceptance_criteria": [
        "File exists at the named path",
        "Section headings match the plan"
      ],
      "dependencies": [],
      "sequence": 1,
      "tags": ["writing"]
    }
  ],
  "rationale": "Split into draft, review, publish because ..."
}
```

## The "I can start now" acceptance bar

Per ADR 0003: every returned task must be small enough that an ADHD-prone
user can pick it up cold without further planning. If a task's
`description` uses words like "consider", "think about", or "explore",
that is the server's bug — the task is not atomic. Surface the issue;
do not paper over it.

## Errors

- `GOAL_REQUIRED` — empty goal.
- `GOAL_TOO_LONG` — over 500 chars (itself a hyperfocus signal — split
  the goal first).
- `TIME_BUDGET_UNPARSEABLE` — `time_budget` was not ISO 8601.
- `BUDGET_INFEASIBLE` — no credible task list fits the budget.
- `ACCEPTANCE_CRITERIA_REQUIRED` — internal; means the model produced a
  task with no criteria. Retry.
- `DEPENDENCY_CYCLE` — internal; retry.

## Limitations

- Stateless. The task list is gone the moment you discard the response.
  Persist via `record-fact` (`predicate: "depends_on"` for the edges) if
  you want it back tomorrow.
- Task estimates are LLM-generated and tend optimistic. Consider adding a
  buffer when the user is showing distress signals; this server does not
  adjust the estimates for you.
- Cross-response dependencies are not modelled — `dependencies[]`
  references siblings only.

## Voice

When showing the task list, lead with sequence 1 — "start here". Do not
present the rationale before the tasks; the user wants the next action,
not the meta-explanation. Save the rationale for a collapsible follow-up.
