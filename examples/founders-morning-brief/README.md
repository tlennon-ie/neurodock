# founders-morning-brief

A 5-minute morning ritual for solo founders and small-team operators. Pulls from all three NeuroDock pillars — chronometric (time and sessions), cognitive graph (memory of yesterday), task fractionator (today's next moves) — and the substrate's profile layer. Calm, not hustle. The brief respects your bandwidth; it does not 10x your output.

## Who this is for

- **Solo founders** who open the laptop in the morning and want a single ritual that surfaces what matters without forcing a context-switch through five apps.
- **Indie hackers** building one or two products part-time and trying to maintain continuity across sessions that may be days apart.
- **Small-team operators** (1–5 people) who wear several hats and need the same brief to cover product, ops, and a thin layer of people work.
- **Founders with ADHD, autism, AuDHD, or any neurotype where time-blindness or context-loss makes the start of the day expensive.** The whole substrate is built for this. Picking a profile (next section) tunes it.

It is **not** for:

- Multi-team engineering organisations. Use `plugins/skill-eng-manager-1on1/` for the 1:1 prep flow and run the morning brief separately.
- VC-pitch prep, fundraising-pipeline tracking, or any "growth-at-all-costs" framing. The brief is deliberately quiet about metrics theatre.
- Replacing your actual project management tool. The brief reads from your local memory; it does not pretend to be the source of truth for tickets, deals, or anything else that lives in another system.

## What you will set up

A morning prompt that, when pasted into Claude Desktop or Claude Code with the NeuroDock MCP servers connected, triggers this sequence:

1. **Time check** via `mcp-chronometric.get_time_context` — what day it is, what energy zone, how long since your last NeuroDock session.
2. **Yesterday's open threads** via `mcp-cognitive-graph.weekly_rollup` — what you decided, what got blocked, what is still open across your projects.
3. **Today's top 3** via `neurodock-mcp-task-fractionator.next_one` for each of your top projects — one concrete next action per project, with a confidence value.
4. **Optional session marking** via `mcp-chronometric.mark_session_start` — anchors today's first focused work block to a stated intent.
5. **A hyperfocus-aware break suggestion** later in the day via `request_break_if_needed` — only if you cross your profile's `hyperfocus_break_minutes` threshold.

This is the same pattern the in-tree `adhd-daily-planner` skill follows. The walkthrough below is more explicit because founders often want to see the wiring.

## One-time setup

### 1. Pick a profile

Copy one of the ND-tuned profiles into place. For most founders one of these three is a sensible starting point:

| Profile                         | Pick this if                                                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles/adhd.yaml`            | You self-identify with ADHD: distractibility, time-blindness, hyperfocus episodes. Defaults to `max_chunk_size: 5`, `hyperfocus_break_minutes: 75`. |
| `profiles/audhd.yaml`           | You self-identify with both ADHD and autistic traits. Tighter `max_chunk_size`, motion reduced, output_format answer_first.                         |
| `profiles/low-stimulation.yaml` | You want the calmest possible default regardless of label. Minimal output, no decoration, motion off.                                               |

Copy your pick to `~/.neurodock/profile.yaml`:

**macOS/Linux:**

```bash
cp profiles/adhd.yaml ~/.neurodock/profile.yaml
```

**Windows PowerShell:**

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.neurodock" | Out-Null
Copy-Item profiles\adhd.yaml "$HOME\.neurodock\profile.yaml"
```

You can edit any field. The profile is yours. See the comments inside each preset for what is opinionated vs. what is meant to be tuned.

### 2. Verify

```bash
neurodock profile show
```

You should see your `display_name`, the active `neurotypes`, your `max_chunk_size`, and `hyperfocus_break_minutes`. If you see schema errors or the file is not picked up, check `~/.neurodock/profile.yaml` exists and is valid YAML.

### 3. Confirm the three MCP servers are wired

This walkthrough assumes the three NeuroDock MCP servers are configured in your client (Claude Desktop, Claude Code, or another MCP-aware client):

- `neurodock-mcp-chronometric`
- `neurodock-mcp-cognitive-graph`
- `neurodock-mcp-task-fractionator`

If you do not yet have those wired, the parallel `examples/claude-desktop/` walkthrough is the install path; come back here once the three servers show up green in your client.

## The morning prompt

Paste this into a fresh Claude conversation in the morning. Tune the wording to your voice; the literal text matters less than the four things it asks for.

> Good morning. It is a new working day. Brief me on yesterday's open threads across my projects, suggest my top three priorities for today given my profile, and mark a focus session anchored to whichever priority I confirm first. Keep it short — answer-first, no pep.

That is the whole ritual. If you do not want the focus session marked, drop the last clause:

> Good morning. It is a new working day. Brief me on yesterday's open threads across my projects and suggest my top three priorities for today. Keep it short — answer-first, no pep.

You can save the prompt as a Claude project instruction or a slash command — the literal text is reproducible across days because all the variability lives in the MCP servers' state, not in the prompt.

## What happens under the hood

When Claude receives the morning prompt with NeuroDock's MCP servers connected, it walks roughly this sequence. Order matters; the prompt is shaped so that step 1 anchors the rest.

1. **Time check.** Calls `mcp-chronometric.get_time_context()` with no arguments. Reads `day_of_week`, `energy_zone`, `time_since_last_prompt`, `current_session_length`. If `time_since_last_prompt` is > 24h, the brief silently widens its lookback window from 7 days to 14 days. If `current_session_length > PT0S` the assistant skips session marking (a session is already open from a previous unfinished day).

2. **Yesterday's open threads.** Calls `mcp-cognitive-graph.weekly_rollup()` with no project filter. Ranks projects by most-recent decision (falling back to most-recent blocker). Caps the project list at `preferences.max_chunk_size` (5 by default, 3 on the AuDHD/low-stim profiles).

3. **Per-project rollups.** For each retained project, calls `mcp-cognitive-graph.weekly_rollup(project=<name>)`. Reads `decisions`, `blockers`, `next_actions` verbatim — does not paraphrase.

4. **Top three priorities.** Picks up to three projects from step 2's ranking (capped, not always full three — if you only had activity on one project this week, you get one). For each, calls `neurodock-mcp-task-fractionator.next_one(project=<name>)`. Three outcomes per project:

   - Success with `confidence >= 0.7` — surfaces the task title verbatim with the confidence value.
   - Success with `confidence < 0.7` — surfaces the title and says "low confidence" plainly.
   - `NO_TASKS_AVAILABLE` — says "no decomposed tasks for <project>; consider `decompose` if it's time to plan it" and moves on.

5. **Optional session mark.** Asks the user which of the surfaced priorities they want to start with. On confirmation, calls `mcp-chronometric.mark_session_start({ "intent": "<priority>" })`. If you said "no focus session" in your prompt variant, this step is skipped.

6. **Hyperfocus check (later in the day, not part of the morning brief itself).** During the day, when you prompt again, Claude reads `current_session_length` from `get_time_context`. If it has crossed your profile's `chronometric.hyperfocus_break_minutes` threshold (75 minutes on the ADHD preset), it surfaces a one-line break suggestion via `request_break_if_needed`. This is not nagging — it is one line, once, and you can ignore it.

Nothing in this flow calls a remote service. Nothing leaves your laptop. The graph, the chronometer, and the fractionator are all local.

## Sample output

A realistic morning on, say, day 14 of using NeuroDock. The graph has built up over two weeks; you have three active projects.

```
Wednesday morning. Three projects with activity this week. Energy zone: morning_peak.

### product-v2
- Most recent decision: ship the auth flow before the demo (2026-05-19, conf 0.85)
- Blocker: webhook signing key rotation not yet documented
- Next: write the runbook entry for key rotation (35 min, conf 0.78)

### customer-research
- Most recent decision: interview pool capped at 8 for this cycle (2026-05-18, conf 0.91)
- Blocker: none
- Next: send follow-up to the three remaining unconfirmed interviewees (15 min, conf 0.82)

### ops-billing
- Most recent decision: switch to net-30 for the two enterprise pilots (2026-05-17, conf 0.79)
- Blocker: invoicing template needs the new entity name
- Next: update the invoicing template (20 min, low confidence 0.45)

---
Energy zone right now: morning_peak. End-of-day stated as 18:00.
This brief is not a productivity scorecard. Yesterday's incomplete items are not graded.

Which one do you want to start with? I'll mark the session.
```

Realistic, not idealised — note the third project's next action has low confidence (0.45). The brief surfaces that plainly instead of hiding it. The fractionator is honest about how confident it is, and so is the brief.

### What the first morning looks like (before the graph has warmed up)

The first time you run the ritual, the graph is empty. The brief is honest about that:

```
No projects in the last 30 days. Nothing to brief against.

If you'd like to start one, the next step is `mark_session_start(intent=<your intent>)`
in mcp-chronometric — that anchors today and gives tomorrow's brief something to draw on.
```

It takes about a week of light use — recording decisions as you make them, marking sessions as you start focused work — for the brief to feel rich. Days 1–3 will be sparse. By day 7 you should see one or two projects rolling up. By day 14 the brief looks like the sample above.

This is intentional. The graph is your memory, not a synthetic one. It records what you tell it. Founders who skip the warm-up and try to bulk-import a Notion database often end up with a graph that does not match how they actually work — and a brief that consequently feels off. Better to let it accrete naturally.

## Variations

### Solo CEO, weekly cadence

If you are running the company solo and most of your projects roll over a week, run the brief once on Monday morning instead of daily. The same prompt works — the `adhd-daily-planner` flow detects `day_of_week == Monday` and produces a weekly brief rather than a daily-light one.

Monday-only ritual:

> Monday morning. Brief me on last week's open threads and suggest this week's top three priorities. Mark a focus session anchored to whichever I confirm.

### Part-time founder, 3x/week

If you only work on the company two or three days a week, the `time_since_last_prompt` check in step 1 silently widens the lookback. No prompt change needed.

Optionally, on the first day back, add one clause:

> Good morning. I've been away from this project since [day]. Brief me on what's still open and suggest where to pick up.

The substrate handles the gap explicitly via `audhd-context-recovery` — see [`packages/skills/audhd-context-recovery/SKILL.md`](../../packages/skills/audhd-context-recovery/SKILL.md). The morning-brief prompt above is enough to trigger it on gaps > 8 hours.

### Founders with co-founders

Add a "sync prompt" alongside the morning brief. Run yours, then once a week run a shared variant:

> It's our co-founder sync. Brief me on what changed across all projects in the last 7 days. Group by project. No priorities — that's what the sync conversation is for.

This drops step 4 (priorities) and step 5 (session marking). It is read-only: a starting point for the meeting, not a meeting-replacement.

### Founders with direct reports

Pair this brief with [`plugins/skill-eng-manager-1on1/`](../../plugins/skill-eng-manager-1on1/). The morning brief sets up your day; the 1:1 prep skill prepares your recurring conversations. They share the same cognitive graph, so a decision you record during a 1:1 surfaces in tomorrow's morning brief automatically.

A common chain:

1. **Morning brief** — `Good morning. Brief me on yesterday's open threads, suggest my top three priorities for today, and mark a focus session.`
2. **Before the 1:1** — `prep my 1:1 with <name>`.
3. **After the 1:1** — `Record this from my 1:1 with <name>: <decision>.` (the cognitive graph stores it, and it surfaces in tomorrow's brief).

## Pairing

- **[`plugins/skill-eng-manager-1on1/`](../../plugins/skill-eng-manager-1on1/)** — for founders with direct reports or mentees. Three flows (1:1 prep, sprint-review decomposition, blameless postmortem) that share the same cognitive graph as the morning brief.
- **[`packages/skills/adhd-daily-planner/`](../../packages/skills/adhd-daily-planner/)** — the in-tree skill that backs the brief's core logic. Worth reading if you want to understand exactly what the assistant is doing under the hood.
- **[`packages/skills/audhd-context-recovery/`](../../packages/skills/audhd-context-recovery/)** — the `/resume` skill that activates automatically when you have been away for more than 8 hours. Useful for part-time founders.

## A note on tone

This walkthrough avoids hustle vocabulary on purpose. The morning brief is a 5-minute calm ritual, not a 10x-your-output rallying cry. If the brief ever lectures you, congratulates you, or asks "shall we crush today?", that is a bug — file an issue. The substrate is built for sustainable working, not maximum output.

The brief is also explicitly NOT a productivity scorecard. It will not enumerate yesterday's incomplete items, calculate a completion percentage, or compare today to last Tuesday. Those are anti-features. Founders who run themselves on scorecards burn out; founders who run themselves on continuity ship longer. NeuroDock picks continuity.

## See also

- [`sample-conversation.md`](./sample-conversation.md) — a standalone end-to-end conversation showing the morning brief with realistic tool calls and outputs.
- [MANIFESTO.md](../../MANIFESTO.md) — the project's five principles. The "calm not hustle" framing here is grounded there.
- [ADR 0001 — Chronometric tool design](../../docs/decisions/0001-chronometric-tool-design.md), [ADR 0002 — Cognitive graph tool design](../../docs/decisions/0002-cognitive-graph-tool-design.md), [ADR 0003 — Task fractionator tool design](../../docs/decisions/0003-task-fractionator-tool-design.md) — the three pillars this brief stitches together.
