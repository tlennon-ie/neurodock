---
name: audhd-context-recovery
version: 0.1.0
description: /resume command — reconstruct yesterday's mental state from the cognitive graph, without inventing facts.
neurotypes: ["audhd", "asd", "adhd"]
status: stable
triggers:
  - command: "/resume"
  - command: "/where-was-i"
  - phrase: "where was I"
  - phrase: "what was I working on"
mcp_dependencies:
  - server: mcp-cognitive-graph
    tools: [recall_entity, weekly_rollup, recall_decisions]
  - server: mcp-chronometric
    tools: [get_time_context]
profile_dependencies:
  - preferences.output_format
  - preferences.max_chunk_size
license: AGPL-3.0-or-later
---

# audhd-context-recovery

A `/resume` command. Reconstructs the user's last working context — active project, recent decisions, open threads — from the local cognitive graph, so the user does not have to remember it.

## When to activate

Activate when any of the following is true:

1. The user types `/resume` or `/where-was-i`.
2. The user's message contains the literal phrases "where was I" or "what was I working on".
3. A session has just opened AND `get_time_context.time_since_last_prompt` is greater than `PT8H`. In this case, do not activate silently — offer it: "It's been a while. Want a /resume?"

Do not activate on every session start. Do not activate mid-conversation. This is a session-opener for a returning user, not a status report.

## Step-by-step

Follow this order. Stop early if a step returns nothing useful and say so plainly.

1. **Read the clock.** Call `get_time_context()`. Note `time_since_last_prompt`. Use this to scope the recap:
   - ≤ 24h: recall the last 7 days of decisions.
   - 1–7 days: recall the last 14 days.
   - > 7 days: recall the last 30 days, and explicitly tell the user the gap.
2. **Find the project.** Parse the trigger for a named project (e.g. `/resume Phase 0 RFC`).
   - If named: `recall_entity(name_or_alias=<that name>)`.
   - If not named: `weekly_rollup()` (no project arg) and use the first project mentioned in `summary` / `decisions` as the most recent.
3. **Resolution check.** If `recall_entity.resolution.method` is `alias`, `fuzzy`, or `embedding`, surface the score and the resolved entity name. Ask the user to confirm before continuing. Do not silently assume the match is right. If `entity` is `null`, stop and tell the user the graph has no record matching that name.
4. **Pull decisions.** Call `recall_decisions(project=<resolved name>, since=<scoped date from step 1>)`. Keep the three most recent.
5. **Pull blockers.** Call `weekly_rollup(project=<resolved name>)`. Use `blockers` and `next_actions`. Keep up to three open threads (a blocker is an open thread; a recent decision without follow-up is an open thread).
6. **Compose the output** in the format below.
7. **Suggest one concrete next move.** Draw it from `weekly_rollup.next_actions` if present, otherwise from the most recent decision lacking follow-up. If neither exists, say "Nothing in the graph suggests an obvious next move — what's on your mind?" Do not invent.

## Output format

Three short sections plus one closing sentence. Plain text. No headings deeper than H3. No tables.

```
You were on: <project name> · last activity <relative timestamp, e.g. "yesterday 16:42">

Recent decisions
- <decision 1, one line, with date>
- <decision 2, one line, with date>
- <decision 3, one line, with date>

Open threads
- <blocker or follow-up 1>
- <blocker or follow-up 2>
- <blocker or follow-up 3>

Next: <one concrete move drawn from the graph>.
```

When the graph is thin, shorten honestly — for example: "Two decisions recorded, no open blockers. Next: nothing obvious — your call."

## Confidence handling

- Alias/fuzzy/embedding resolution: surface the entity name and score before producing the recap. Example: "I read 'Phase 0 RFC' as the entity 'Phase 0 RFC' (alias match, score 0.92). Continue?"
- `entity == null`: do not fabricate. Say "No entity matches '<input>'. Want to try a different name, or run /resume with no argument?"
- `decisions == []` and `blockers == []`: say so. Do not pad.
- Truncation flags (`truncated_facts`, `truncated`): mention them briefly. "Older items were truncated."

## What this skill is NOT

- Not a session-opener for every session. Only on explicit request or after an 8-hour gap.
- Not a productivity rebuke. The skill never comments on the length of the gap.
- Not a moral judgement on time away. No "welcome back!", no "you've been gone a while", no warmth-performance.
- Not a planner. It reconstructs context; `adhd-daily-planner` plans the day.
- Not a fact-inventor. If the graph does not say it, the skill does not say it.

## Voice

Direct. Plain. Past tense for what was decided; present tense for what is open. Talk about the work — projects, decisions, threads — not about the user's neurotype. No clinical framing. No "executive function". No "context-switching tax".
