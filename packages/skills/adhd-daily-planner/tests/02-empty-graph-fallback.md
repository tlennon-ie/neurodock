# Test: 02 — Empty cognitive graph fallback

## Scenario

It is Tuesday, 2026-05-19, 09:05 local time. The user has just completed `npx neurodock init` for the first time and types `plan my day`. Their profile is the freshly-generated default: `identity.neurotypes: ["adhd"]`, `preferences.output_format: "answer_first"`, `preferences.max_chunk_size: 5`, `chronometric.end_of_day_local: "18:30"`. The local cognitive graph is empty — no projects, no decisions, no blockers, no recorded facts of any kind. The unscoped `weekly_rollup()` call returns the canonical quiet-week response with empty arrays.

## Expected MCP tool sequence

1. `mcp-chronometric.get_time_context()` →
   ```json
   {
     "now": "2026-05-19T09:05:48+01:00",
     "day_of_week": "Tuesday",
     "time_since_last_prompt": "PT0S",
     "current_session_length": "PT0S",
     "energy_zone": "morning_peak"
   }
   ```
2. `mcp-cognitive-graph.weekly_rollup()` (unscoped) →
   ```json
   {
     "project": null,
     "period": { "start": "2026-05-12", "end": "2026-05-19" },
     "summary": "This week across all projects: 0 decisions recorded, 0 blockers noted, 0 candidate next actions.",
     "decisions": [],
     "blockers": [],
     "next_actions": [],
     "generated_at": "2026-05-19T09:05:48+01:00"
   }
   ```

(The skill MUST stop after step 2. No per-project rollups. No `recall_decisions`. No `next_one`. There is nothing to brief against.)

## Expected response shape

- Opens with a single short paragraph that states there are no projects in the last 30 days, in plain prose.
- Contains the literal MCP tool reference `mark_session_start` so the user has a precise next step they can copy.
- Names the tool's `intent` parameter explicitly, so the user knows what to pass.
- Does NOT render any `### <Project name>` sections (there are none).
- Does NOT fabricate any project names, decisions, blockers, or next-actions.
- Does NOT contain the closing "Elided N further projects" line.
- Does NOT contain a productivity-pep sentence.
- Total response length ≤ 600 characters.

## Pass criteria

- [ ] Tool sequence is exactly two calls: `get_time_context()` then unscoped `weekly_rollup()`.
- [ ] The skill does NOT call `next_one`, `recall_decisions`, or any per-project `weekly_rollup`.
- [ ] Response contains the substring `mark_session_start`.
- [ ] Response contains the word `intent` near `mark_session_start` (within 80 characters).
- [ ] No `### ` (markdown H3) headings are emitted.
- [ ] No invented project names appear in the response. (Runner asserts response does not contain any string from a banned-fabrication list, e.g. `your project`, `the project you're working on`.)
- [ ] None of these substrings appear: `superpower`, `crusher`, `smash`, `you got this`, `let's go`, `differently abled`, `executive dysfunction`.
- [ ] No `!` anywhere in the response.
- [ ] Total response is ≤ 600 characters.
