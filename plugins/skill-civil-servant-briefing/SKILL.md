---
name: skill-civil-servant-briefing
version: 0.1.0
description: Three civil-servant flows — draft a structured briefing note, synthesise stakeholder consultation responses, or set meeting-marathon chronometric thresholds for a sitting-day.
neurotypes: []
status: stable
triggers:
  - phrase: "draft a briefing note on"
  - phrase: "draft a brief on"
  - phrase: "write a briefing note on"
  - phrase: "synthesise stakeholder responses on"
  - phrase: "synthesize stakeholder responses on"
  - phrase: "synthesise consultation responses on"
  - phrase: "synthesize consultation responses on"
  - phrase: "stakeholder synthesis on"
  - phrase: "meeting marathon mode"
  - phrase: "marathon mode for today"
  - phrase: "sitting-day mode"
mcp_dependencies:
  - server: neurodock-task-fractionator
    tools: [decompose]
  - server: neurodock-cognitive-graph
    tools: [recall_entity, recall_decisions]
  - server: neurodock-chronometric
    tools: [mark_session_start, mark_session_end, request_break_if_needed]
    optional: true
profile_dependencies:
  - preferences.output_format
  - preferences.max_chunk_size
license: AGPL-3.0-or-later
authors:
  - NeuroDock contributors
---

# skill-civil-servant-briefing

Three flows a civil servant, policy adviser, or NGO programme manager actually runs in a working week: draft a briefing note to a Minister, Secretary General, board, or programme committee in the canonical Background / Current position / Options / Recommendation / Risks structure; synthesise a pile of consultation responses into a stakeholder map that respects the principled disagreements without editorialising; protect a sitting-day with six or more back-to-back meetings from premature break nudges by raising hyperfocus thresholds for that day only. The trigger phrases are unambiguous on purpose — they will not steal activation from any general planning or note-taking skill.

This is not a policy-advocacy tool. It does not argue for or against a position. It produces the artefacts a public servant produces — a structured note that lays out the considerations, a structured map of who said what — and stops.

## When to activate

Activate when the user's message contains one of the trigger phrases verbatim. The trigger phrase determines which of the three flows runs:

- `draft a briefing note on <topic>, <N> pages` / `draft a brief on <topic>, <N> pages` / `write a briefing note on <topic>, <N> pages` → **Flow A: briefing note**.
- `synthesise stakeholder responses on <consultation>` (and `synthesize` / `synthesise consultation responses on` / `synthesize consultation responses on` / `stakeholder synthesis on` variants) → **Flow B: stakeholder synthesis**.
- `meeting marathon mode` / `marathon mode for today` / `sitting-day mode` → **Flow C: meeting marathon**.

Do not activate on partial matches ("we should write something on housing"), past tense ("the briefing went down well"), or third-person reports about briefings the user did not write. Do not activate if a separate skill is already running its flow in this turn; let the more general skill finish.

## Flow A — briefing note

The user says some variant of `draft a briefing note on housing supply, 4 pages`. Goal: a section-by-section plan that respects the canonical structure and the stated page budget, each section sized so it can be drafted as one atomic write task.

1. **Parse the topic and the page budget.** Everything between `on` and the comma is the topic, verbatim. Everything between the comma and `pages` is the page budget — parse the leading integer. If no page budget is supplied (e.g. `draft a briefing note on housing supply`), default to 4 pages. Do not silently expand or contract a stated budget.

2. **Compute section budgets.** The five canonical sections, in fixed order, with default page-share weights:

   - `Background` — 0.20 of total
   - `Current position` — 0.20 of total
   - `Options` — 0.30 of total
   - `Recommendation` — 0.15 of total
   - `Risks` — 0.15 of total

   Multiply weights by the page budget, round to the nearest 0.25 page. For ties at exactly the half-quarter (e.g. 0.60), round the section closer to Recommendation UP and the section closer to Risks DOWN — that is, Recommendation gets the rounding benefit before Risks, because a tight Risks section forces the writer to be specific. For a 4-page budget this yields 0.75 / 0.75 / 1.25 / 0.75 / 0.50, summing to 4.0. If rounding drops below the budget, top up the largest section (Options). If rounding overruns, trim the largest section. The five sections MUST sum to exactly the stated page budget.

3. **Call `decompose`.** Pass the topic and section budgets as one goal string with a 90-minute time budget (`PT90M`) — that reflects how long a competent author needs for a four-page note from a standing start. For longer notes, scale: `PT90M` for ≤4 pages, `PT3H` for 5-8 pages, `PT6H` for 9-15 pages, `PT2D` for 16+ pages (the task-fractionator interprets `P_D` as working blocks per ADR 0003 §3).

   The goal string is constructed verbatim as:

   ```
   Draft a public-service briefing note on: <topic>. Total length: <N> pages. Five sections in canonical order with these page budgets:
   1. Background (<X.XX> pages)
   2. Current position (<X.XX> pages)
   3. Options (<X.XX> pages)
   4. Recommendation (<X.XX> pages)
   5. Risks (<X.XX> pages)
   Each section is one atomic write task. Do not editorialise in section headings — the headings are fixed.
   ```

4. **Three outcomes from `decompose`:**

   - **Success** — a list of atomic write tasks, one per section (or more, if `decompose` further subdivides a section). Continue to step 5.
   - **`BUDGET_INFEASIBLE`** — surface as one line: `The page budget is too tight for the topic as stated. Try a longer note, or narrow the topic.` Stop.
   - **`DECOMPOSITION_UNAVAILABLE` or any other error** — surface the error code on one line. Stop.

5. **Render the section plan.** See "Output format — Flow A" below. The five section headings are FIXED: `Background`, `Current position`, `Options`, `Recommendation`, `Risks`. In that order. Do not rephrase. Do not add adjectives. Do not editorialise (no "Surprising Background", no "Bold Options", no "Critical Risks"). The headings are institutional vocabulary and they carry weight precisely because they are predictable.

6. **Stop.** Do not draft the note itself — the section plan with task breakdown is the deliverable. Do not suggest tone, audience, or "what the Minister will want to hear". Do not propose follow-up actions ("shall I draft Background first?"). The plan stands on its own.

## Flow B — stakeholder synthesis

The user says some variant of `synthesise stakeholder responses on the planning-act consultation`. Goal: a map of which stakeholder said what, structured as supports / objects / principled disagreements, sourced ENTIRELY from facts recorded in the cognitive graph. The skill MUST NOT editorialise about the merits of any position.

1. **Parse the consultation name.** Everything after `on` is the consultation name, verbatim. Trim. Treat the parsed string as an entity name to recall.

2. **Recall the consultation entity.** Call `recall_entity({ "name_or_alias": "<consultation name>" })`. This entity is expected to be of `type: "consultation"` (or `"project"`, depending on how the user has been recording it). The neighbours of this entity are the stakeholder organisations; the facts attached to those stakeholders are their stated positions.

3. **Resolution check.** If `resolution.method` is `alias`, `fuzzy`, or `embedding`, surface the resolved entity name and the resolution score before continuing. Ask: `I read "<parsed name>" as the consultation "<resolved>" (<method> match, score <score>). Continue?` Wait for confirmation. Do not assume.

4. **If `entity` is null or no stakeholder neighbours exist**, say so plainly: `No consultation in the graph matches "<parsed name>", or no stakeholder responses have been recorded against it. Record stakeholder positions with `record_fact` before running the synthesis.` Stop.

5. **For each stakeholder neighbour**, call `recall_entity({ "name_or_alias": "<stakeholder name>" })` to pull their facts. Filter facts on the predicates `supports`, `objects_to`, `position_on`, and `disagrees_with` — these are the positions recorded against this consultation. Keep facts whose `object.literal` references the consultation by name.

6. **Bucket the positions:**

   - **Supports** — predicate `supports` or `position_on` where the literal contains supportive language verbatim ("in favour", "endorses", "supports").
   - **Objects** — predicate `objects_to` or `position_on` where the literal contains objecting language verbatim ("objects to", "opposes", "rejects").
   - **Principled disagreements** — pairs of stakeholders whose positions are recorded as `disagrees_with` linking them, OR where one supports and another objects on the same identified sub-issue (sub-issue extracted from the literal verbatim, no paraphrase).

7. **Render the stakeholder map.** See "Output format — Flow B" below. CRITICAL: every position is quoted VERBATIM from the `object.literal` of the recalled fact. Do not paraphrase. Do not summarise. Do not characterise positions ("a reasonable view", "an extreme position", "an outlier"). The output is structured recall, nothing more.

8. **Stop.** Do not propose how to weight the responses, do not recommend a Departmental position, do not suggest which stakeholders are influential. The map is the deliverable.

## Flow C — meeting marathon

The user says some variant of `meeting marathon mode` on a day when six or more meetings are stacked. Goal: temporarily raise the chronometric hyperfocus thresholds so the substrate's break nudges respect the reality of a sitting-day. Explicitly temporary — defaults restore at end of day.

1. **Confirm scope.** Ask one question: `Confirming marathon mode for today only — gentle nudge at 90 minutes, firm nudge at 150, hard stop at 210. Default thresholds restore at midnight local. Proceed?` Wait for confirmation.

2. **On confirmation, emit the structured threshold block.** See "Output format — Flow C" below. The three thresholds are FIXED at `90`, `150`, `210` minutes — these are calibrated for a meeting-heavy day (a meeting roughly every 30 minutes does not need a stretch nudge every 45). The skill MUST surface these as integers, not approximations.

3. **If `neurodock-chronometric` is available**, call `mark_session_start({ "intent": "meeting marathon — 6+ scheduled meetings, raised break thresholds (gentle 90, nudge 150, hard 210) until EOD" })` so the substrate's break-suggestion logic has the intent on file when it polls `request_break_if_needed`. The actual threshold values are surfaced to the caller (the host LLM) — the skill itself does not override the MCP's default `threshold_minutes` argument; the host LLM consuming this skill's output is expected to pass the marathon values when it calls `request_break_if_needed` during the day.

4. **If `neurodock-chronometric` is NOT available**, still emit the threshold block — the user has been told what mode the skill is in, even if the substrate's automated nudging is not wired up. Do not silently degrade.

5. **Stop.** Do not propose a meeting agenda. Do not coach on meeting facilitation. Do not say "good luck". The threshold block plus the EOD-restore confirmation is the deliverable.

## Output format

### Flow A — briefing note

Strict "Answer First". First sentence ≤ 100 characters.

```
Briefing note plan — <topic>, <N> pages. <count> atomic write tasks.

### Background (<X.XX> pages)
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>

### Current position (<X.XX> pages)
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>

### Options (<X.XX> pages)
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>

### Recommendation (<X.XX> pages)
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>

### Risks (<X.XX> pages)
- <task title> (<estimated_minutes> min)
  Acceptance: <first acceptance criterion>

Five sections, fixed order, fixed headings. Page budgets sum to <N>. The plan is the deliverable — not the draft.
```

Rules:

- The five section headings are FIXED: `Background`, `Current position`, `Options`, `Recommendation`, `Risks`. In that order, verbatim, no adjectives.
- Page budgets MUST sum exactly to the user's stated total.
- If `decompose` subdivides a section into multiple tasks, list them all under that section's heading — do not collapse.
- Estimates are surfaced verbatim from the `decompose` result — do not round or restate.
- The closing line is mandatory; it grounds the user that the plan is structural, not editorial.

### Flow B — stakeholder synthesis

```
Stakeholder synthesis — <consultation name>. <S> stakeholders, <P> recorded positions.

### Supports
- <stakeholder name>: "<position verbatim from fact.object.literal>" (recorded <YYYY-MM-DD>)
- <stakeholder name>: "<position verbatim from fact.object.literal>" (recorded <YYYY-MM-DD>)

### Objects
- <stakeholder name>: "<position verbatim from fact.object.literal>" (recorded <YYYY-MM-DD>)
- <stakeholder name>: "<position verbatim from fact.object.literal>" (recorded <YYYY-MM-DD>)

### Principled disagreements
- On <sub-issue, extracted verbatim from the facts>:
  - <stakeholder A>: "<position verbatim>"
  - <stakeholder B>: "<position verbatim>"

This is structured recall. Every position is quoted from the graph verbatim. The synthesis does not weight, rank, or characterise the views.
```

Rules:

- Every position is quoted verbatim from `fact.object.literal`. No paraphrase, no summary, no characterisation.
- If a bucket has no entries, write `- (no positions recorded in this bucket)` rather than omitting the heading.
- The closing line is mandatory; it is the user's reminder, when they share the synthesis upward, of what it does and does not do.
- Stakeholders appear in the order their first position appears in the recall, not alphabetically.

### Flow C — meeting marathon

```
Meeting marathon mode — confirmed for today only.

### Thresholds (temporary)
- Gentle nudge: 90 minutes
- Firm nudge: 150 minutes
- Hard stop: 210 minutes

### Restoration
- Default thresholds restore automatically at 00:00 local.
- This change applies to today's sitting-day only.

The substrate's break-suggestion logic will respect these values for the rest of today.
```

Rules:

- The three threshold numbers are FIXED at exactly `90`, `150`, and `210`. Surface them as integers with the word `minutes`.
- The restoration block is mandatory; it is the user's contract that the change is not silently permanent.
- If `neurodock-chronometric` is unavailable, the closing line changes to: `The chronometric MCP is not connected — these thresholds are noted but the substrate's nudges are not currently wired.` Do not silently degrade.

## Distress signal handling

If the user's invoking message contains phrases like `the Minister will be furious`, `the press are onto this`, `this could end the Department`, the skill MUST acknowledge the pressure but MUST NOT shift the flow toward editorialising. One sentence: `Understood. The note (or map) will still be structurally neutral — that's the point. Political handling of the artefact is a conversation for elsewhere.` Then continue with the requested flow as defined.

## Do not

- Do not editorialise in Flow A section headings. The five headings are fixed and carry weight precisely because they are predictable.
- Do not draft the note itself in Flow A — only the plan. Drafting is a follow-on task.
- Do not paraphrase, summarise, or characterise stakeholder positions in Flow B. Quote verbatim or do not quote.
- Do not weight stakeholders in Flow B ("the IFA is influential", "this is a minority view"). Influence-weighting is the user's job, not the skill's.
- Do not output "courageous", "bold", "brave", "innovative", "world-class", or any other puffery from political-press release vocabulary.
- Do not output "stakeholders need to come together", "balance must be struck", "all sides have valid points", or any false-balance framing. Either quote a position or do not.
- Do not extend marathon mode silently past midnight. The restoration block is mandatory.
- Do not propose a Departmental line, a recommendation, or a Minister's preferred answer. The skill produces structure, not advice.
- Do not activate inside another skill's flow. Let it finish first.
- Do not call `record_fact`. The cognitive graph is the user's record, not the skill's logbook.

## What this skill is not

- Not a policy-advocacy tool. It does not argue for or against a position.
- Not a Ministerial-correspondence drafter. Letters to a Minister or from a Minister are a different artefact.
- Not a press-line generator.
- Not a stakeholder-influence analyser. The synthesis reports what was said, not who matters.
- Not a clinical tool. The skill makes no claims about the user's neurotype.

## Examples

See `tests/`:

- `tests/01-draft-briefing-note.md` — Flow A drafting a 4-page note in the canonical structure.
- `tests/02-stakeholder-synthesis.md` — Flow B with three recorded stakeholders and one principled disagreement.
- `tests/03-meeting-marathon-mode.md` — Flow C raising thresholds for a sitting-day with default-restore-at-EOD.
