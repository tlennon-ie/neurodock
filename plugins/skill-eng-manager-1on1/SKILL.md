---
name: skill-eng-manager-1on1
version: 0.1.0
description: Three engineering-manager flows — prep a 1:1 from prior context, decompose a sprint review, or walk a blameless postmortem.
neurotypes: []
status: stable
triggers:
  - phrase: "prep my 1:1 with"
  - phrase: "prep my one-on-one with"
  - phrase: "prep my 1-on-1 with"
  - phrase: "1:1 prep for"
  - phrase: "decompose this sprint review"
  - phrase: "decompose this retro"
  - phrase: "decompose these sprint notes"
  - phrase: "blameless postmortem on"
  - phrase: "blameless post-mortem on"
  - phrase: "walk a postmortem on"
mcp_dependencies:
  - server: neurodock-task-fractionator
    tools: [decompose]
  - server: mcp-cognitive-graph
    tools: [recall_entity, recall_decisions, record_fact]
    optional: true
  - server: mcp-chronometric
    tools: [get_time_context, mark_session_start, mark_session_end]
    optional: true
profile_dependencies:
  - preferences.output_format
  - preferences.max_chunk_size
license: AGPL-3.0-or-later
authors:
  - NeuroDock contributors
---

# skill-eng-manager-1on1

Three flows an engineering manager (or tech lead, or staff+ IC with mentees) actually does: prep a recurring 1:1 from the last few conversations, decompose unstructured sprint-review notes into atomic items grouped by owner, walk a blameless postmortem on an incident without ever pointing at a person. The trigger phrases are unambiguous on purpose — they will not steal activation from `adhd-daily-planner` or any general planning skill.

This is not a performance-management tool. It does not score reports, rank them, summarise their tone, or feed anything into a performance cycle. It is a working tool for the person running the meeting.

## When to activate

Activate when the user's message contains one of the trigger phrases verbatim. The trigger phrase determines which of the three flows runs:

- `prep my 1:1 with <name>` / `prep my one-on-one with <name>` / `prep my 1-on-1 with <name>` / `1:1 prep for <name>` → **Flow A: 1:1 prep**.
- `decompose this sprint review` / `decompose this retro` / `decompose these sprint notes` → **Flow B: sprint-review decomposition**.
- `blameless postmortem on <incident>` / `blameless post-mortem on <incident>` / `walk a postmortem on <incident>` → **Flow C: postmortem**.

Do not activate on partial matches ("can we 1:1 sometime"), past tense ("the postmortem went well"), or third-person reports about meetings the user is not running. Do not activate if a separate skill — for example `audhd-context-recovery` or `adhd-daily-planner` — is already running its flow in this turn; let the more general skill finish.

## Flow A — 1:1 prep

The user says some variant of `prep my 1:1 with Sarah`. Goal: a one-page brief built from what the graph remembers about Sarah and any open threads tagged to her.

1. **Parse the name.** Everything after `with` (or after `for` for the `1:1 prep for` variant) is the person's name. Trim. Treat the parsed string verbatim — do not normalise capitalisation, do not expand nicknames.

2. **Recall the entity** (only if `mcp-cognitive-graph` is available; otherwise skip to step 6 with the empty-graph fallback). Call `recall_entity({ "name_or_alias": "<parsed name>" })`.

3. **Resolution check.** If `resolution.method` is `alias`, `fuzzy`, or `embedding`, surface the resolved entity name and the resolution score before continuing. Ask one question: `I read "<parsed name>" as the entity "<resolved>" (<method> match, score <score>). Continue?` Wait for confirmation. Do not assume.

4. **If `entity` is null**, say so plainly: `No entity in the graph matches "<parsed name>". I can still help you prep — what's on your mind for this conversation?` Stop and wait for the user.

5. **Compose the brief from `recall_entity`'s returned data.** Read three things:

   - `entity.last_interaction_at` (or the most recent `facts[].recorded_at` if the entity lacks a `last_interaction_at` field) — this is the "last conversation" timestamp.
   - `facts[]` filtered to predicates `mentioned_in`, `decided_in`, `blocked_by` — these become "open topics".
   - `neighbours[]` — these are the projects and decisions Sarah is connected to.

6. **Render the brief.** See "Output format — Flow A" below.

7. **Stop.** Do not propose meeting structure, agenda items the user did not ask for, or "how do you usually start your 1:1s". The brief is the deliverable.

## Flow B — sprint-review decomposition

The user says `decompose this sprint review` (or one of the equivalent triggers) and either pastes notes directly, or says they will paste them.

1. **Ask for the notes** only if they have not been provided in the same turn. One sentence: `Paste the notes. I'll group atomic action items by owner.` Wait. Do not editorialise.

2. **Once notes are in hand**, call `decompose({ "goal": "<the pasted notes, verbatim>", "time_budget": "PT45M" })`. The 45-minute time budget is the default — it maps to roughly one working block. If the notes themselves state a different budget (e.g. "we have a week for this"), parse that and pass it as ISO 8601 (e.g. `P5D`). The task-fractionator interprets `P5D` as five working blocks of 4h, not 120h calendar — see ADR 0003 §3.

3. **Three outcomes from `decompose`:**

   - **Success** — a list of atomic tasks, each with at least one acceptance criterion. Continue to step 4.
   - **`BUDGET_INFEASIBLE`** — surface the error message as one line: `The notes describe more work than fits in the time budget. Try a longer budget, or break the review into two passes.` Stop.
   - **`DECOMPOSITION_UNAVAILABLE` or any other error** — surface the error code on one line. Stop.

4. **Group tasks by owner.** Owners are extracted from the tags returned by `decompose` (the task-fractionator tags atomic tasks with role/owner hints when the source text contains them). If a task has no owner tag, group it under `Unassigned`.

5. **Render the grouped action items.** See "Output format — Flow B" below.

6. **Stop.** Do not propose follow-up rituals ("schedule the retro retro"), do not ask "shall I file these as tickets". The grouped list is the deliverable.

## Flow C — blameless postmortem

The user says `blameless postmortem on <incident>`. This flow walks 5 Whys plus a small system-factors checklist. It MUST NEVER name a person as the cause and MUST NEVER use blaming language ("X should have", "Y failed to", "Z dropped the ball").

1. **Anchor the incident.** Restate what the user named, verbatim, in one sentence: `Walking a blameless postmortem on: <incident as stated>. I'll ask five Whys, then map system factors. We will not name a person as cause.`

2. **Five Whys, one at a time.** Ask the user the first Why. Wait. After their answer, ask the next Why grounded in their answer. Each Why is a single sentence ending with a question mark. Each Why targets a system, a process, a tool, or a condition — never a person.

   Examples of acceptable Why phrasings:

   - `Why did the system enter that state?`
   - `Why was that condition possible in the first place?`
   - `Why did the alerting/runbook/deployment process allow it?`

   Banned Why phrasings (these are blaming dressed up as Whys):

   - `Why didn't <name> notice?` — restate as `Why did the alerting not surface it?`
   - `Why did <name> push that change?` — restate as `Why did the change-gate allow it through?`
   - `Why didn't anyone catch this?` — restate as `Why did the review process not flag it?`

   If the user's own answer names a person, accept the answer but rephrase the next Why to target the system around that person, not the person.

3. **After five Whys (or sooner if the chain has terminated in a system root cause)**, list system factors. Ask one short question: `Which of these system factors were in play? (You can name more than one.)` Then list six candidates:

   - `Documentation gap` — runbook missing, stale, or wrong.
   - `Observability gap` — the system did not surface the problem in time.
   - `Change-gate gap` — the deploy/review/test process let the issue through.
   - `Capacity gap` — the team was stretched; the work could not get the attention it needed.
   - `Tool gap` — the available tools made the safe path harder than the unsafe path.
   - `Context gap` — the person doing the work did not have the information they would have needed (and this is the system's job to fix, not theirs).

4. **Compose the postmortem skeleton.** See "Output format — Flow C" below.

5. **Optionally record.** If `mcp-cognitive-graph` is available AND the user explicitly opts in (`record this in the graph?`), call `record_fact` once per identified system factor with `predicate: "tagged"` and `object.literal: "<factor-key>"`, subject scoped to a postmortem entity named after the incident. Skip silently if the user does not opt in.

6. **Stop.** Do not propose remediation actions in this flow — that is a follow-up conversation. The skeleton is the deliverable.

## Output format

### Flow A — 1:1 prep

Strict "Answer First". First sentence ≤ 100 characters.

```
1:1 prep — <person name>. Last interaction: <relative timestamp, e.g. "8 days ago, 2026-05-12">.

### Open topics
- <fact 1, one line, with date>
- <fact 2, one line, with date>
- <fact 3, one line, with date>

### Recent context
- <neighbour 1: project or decision name> (<relationship>)
- <neighbour 2: project or decision name> (<relationship>)

Suggested opener: "<one short, concrete opener drawn from the most recent open topic>."
This brief is for you, not for sharing. It is not a performance summary.
```

Rules:

- Maximum three bullets per section. If fewer than three open topics exist, list what you have — do not invent.
- Confidence is not surfaced in this flow (a 1:1 brief is for the human running the meeting; pretending the graph is more certain than it is would mislead).
- The "not a performance summary" line is mandatory.

Empty-graph fallback (used when `mcp-cognitive-graph` is unavailable or the entity is null):

```
1:1 prep — <person name>. No prior context in the graph.

I can still help. What's on your mind for this conversation? If you'd like me to capture anything for next time, say "record this" once we're done.
```

### Flow B — sprint-review decomposition

```
Sprint-review decomposition — <N> atomic items, <M> owners.

### <Owner name>
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>

### <Owner name>
- ...

### Unassigned
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>

These items are decomposed from your notes. I did not invent owners or estimates.
```

Rules:

- Owners appear in the order the first task for each owner appears in the decomposition.
- Estimates are surfaced verbatim from the decompose result — do not round or restate.
- The closing line is mandatory; it grounds the user that the decomposition is constrained to what their notes said.

### Flow C — blameless postmortem

```
Postmortem skeleton — <incident as stated>

### Why chain
1. Why? <user's answer>
2. Why? <user's answer>
3. Why? <user's answer>
4. Why? <user's answer>
5. Why? <user's answer (or "chain terminated earlier at a system root cause")>

### System factors in play
- <factor 1>
- <factor 2>
- <factor 3>

### What this postmortem does NOT contain
- A person named as cause.
- A remediation action list (that is a follow-up conversation).
- A judgement about whether the incident was avoidable.
```

The "does NOT contain" block is mandatory. It is the user's reminder, when they share the skeleton, of what is and is not in scope.

## Distress signal handling

If the user's invoking message contains phrases like `I'm furious`, `someone needs to be held accountable`, `this is on <name>`, the skill MUST acknowledge the feeling but MUST NOT shift the flow toward naming a person. One sentence: `Understood. The postmortem still won't name a person — that's the point of it being blameless. We can route accountability conversations separately if you want.` Then continue with Flow C as defined.

## Do not

- Do not score, rank, or rate any person mentioned in any flow.
- Do not output the words "underperforming", "should have known", "let the team down", "needs to step up", or any equivalent.
- Do not use "synergy", "rockstar", "10x", "ninja", "growth mindset", "stretch goal", or any other middle-management-speak.
- Do not propose performance-management actions (PIPs, escalations, role changes). This skill is for the work, not for HR.
- Do not invent open topics in Flow A. If the graph has no facts on the entity, say so.
- Do not paraphrase facts returned by `recall_entity` — quote the literal text.
- Do not call `decompose` in Flow A or Flow C. It is a Flow B tool.
- Do not call `record_fact` without explicit user opt-in. The cognitive graph is the user's notebook, not the skill's logbook.
- Do not activate inside another skill's flow. Let it finish first.
- Do not exceed three bullets per section in Flow A.

## What this skill is not

- Not a performance-review prep tool.
- Not a coaching framework.
- Not a sprint-planning tool (it decomposes a _review_, not a roadmap).
- Not a root-cause analysis tool for non-incident work.
- Not a clinical tool. The skill makes no claims about the user's or their reports' neurotypes.

## Examples

See `tests/`:

- `tests/01-prep-1on1.md` — Flow A with two mocked facts in the graph.
- `tests/02-decompose-sprint-review.md` — Flow B with pasted notes and a 45-minute budget.
- `tests/03-blameless-postmortem.md` — Flow C walking 5 Whys without ever naming a person.
