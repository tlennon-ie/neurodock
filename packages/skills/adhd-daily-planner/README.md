# adhd-daily-planner

A NeuroDock skill that produces a once-a-day morning brief from the local cognitive graph: which projects had activity, what was decided, what is blocked, and one concrete next-action per project. On Monday it expands to a weekly stack; on other weekdays it stays light.

## When it fires

- The user types `/resume monday` or `/morning-brief`.
- The user's message contains `what's on today`, `plan my day`, `what should I do today`, or `monday morning`.
- The user's first interaction of a new local day, when their profile opts into `answer_first` output.

It will not fire inside an already-running session — by design, the brief is a start-of-day surface, not a mid-session interrupt.

## What it reads

- `mcp-chronometric.get_time_context()` — day, energy zone, current session length.
- `mcp-cognitive-graph.weekly_rollup()` — which projects had activity in the trailing seven days.
- `mcp-cognitive-graph.weekly_rollup(project=…)` — per-project decisions, blockers, candidate next-actions.
- `mcp-cognitive-graph.recall_decisions(project, since)` — surfaces recent decisions when a project has no auto-suggested next action.
- `mcp-task-fractionator.next_one(project)` — exactly one task per project, with the server's own confidence score.

It writes nothing. Every call is a pure read.

## How to disable

Remove the trigger phrases from `~/.neurodock/profile.yaml` under `skills.adhd-daily-planner.triggers`, or set `skills.adhd-daily-planner.enabled: false`. Either change is picked up immediately; no restart.

## Output discipline

The skill follows the project-wide "Answer First" rule: the first sentence fits in 80 characters and names the day's shape. Project sections cap at three bullets each. The closing line is always present and is always non-judgmental.

See  (Launch skills #1) for the canonical spec, and `SKILL.md` for the full instructions the LLM follows when this skill activates. The three files under `tests/` are the executable contract — CI replays them against a reference MCP client on every PR.

Licensed AGPL-3.0-or-later.
