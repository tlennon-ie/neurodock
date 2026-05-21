---
name: skill-lawyer-matter
version: 0.1.0
description: Three lawyer/paralegal flows — brief a matter from prior context, run a forward-window deadline check, or translate an incoming email.
neurotypes: []
status: stable
triggers:
  - phrase: "matter brief:"
  - phrase: "matter brief on"
  - phrase: "brief me on the matter"
  - phrase: "deadline check for the next"
  - phrase: "deadlines for the next"
  - phrase: "deadline check next"
  - phrase: "translate this email for me"
  - phrase: "translate this email"
  - phrase: "translate this correspondence"
mcp_dependencies:
  - server: neurodock-cognitive-graph
    tools: [recall_entity, recall_decisions, record_fact]
  - server: mcp-translation
    tools: [translate_incoming]
    optional: true
plugin_dependencies:
  - name: translation-legal
    type: translation-pack
    optional: true
profile_dependencies:
  - preferences.output_format
license: AGPL-3.0-or-later
authors:
  - NeuroDock contributors
---

# skill-lawyer-matter

Three flows a lawyer or paralegal actually runs across the working day: pull a brief on a single matter from what the cognitive graph already knows, surface deadlines within a forward window, and read the literal subtext of an incoming email. The trigger phrases are unambiguous on purpose — they will not steal activation from `adhd-daily-planner`, `audhd-context-recovery`, or any other general planning skill.

This is **not** a legal-advice tool. It does not interpret statute, predict litigation outcomes, draft pleadings, or render any opinion on the merits. It surfaces what the user has already recorded, in the structure a senior lawyer expects. Every output is the user's own facts re-presented — never the skill's analysis of those facts.

## When to activate

Activate when the user's message contains one of the trigger phrases verbatim. The trigger phrase determines which of the three flows runs:

- `matter brief: <name>` / `matter brief on <name>` / `brief me on the matter <name>` → **Flow A: matter brief**.
- `deadline check for the next <N> days` / `deadlines for the next <N> days` / `deadline check next <N> days` → **Flow B: deadline check**.
- `translate this email for me` / `translate this email` / `translate this correspondence` → **Flow C: email translation**.

Do not activate on partial matches ("what's the deadline?"), past tense ("the matter closed last week"), or third-person reports about matters the user is not running. Do not activate if a separate skill — for example `audhd-context-recovery` or `adhd-daily-planner` — is already running its flow in this turn; let the more general skill finish.

## Flow A — matter brief

The user says some variant of `matter brief: Acme v Beta`. Goal: a structured brief in the format a senior lawyer expects — deadlines, opposing counsel, latest filing, outstanding tasks — built from what the graph already knows.

1. **Parse the matter name.** Everything after the colon (for the `matter brief:` variant) or after `on` / `the matter` (for the verbose variants) is the matter name. Trim. Treat the parsed string verbatim — do not normalise capitalisation, do not abbreviate `Acme Corp v Beta Holdings` to `Acme v Beta`.

2. **Recall the entity.** Call `recall_entity({ "name_or_alias": "<parsed matter name>" })`. The matter is expected to exist in the graph as an entity of type `project` (matters map to the `project` type in the v0.1.0 entity taxonomy).

3. **Resolution check.** If `resolution.method` is `alias`, `fuzzy`, or `embedding`, surface the resolved entity name and the resolution score before continuing. Ask one question: `I read "<parsed name>" as the matter "<resolved>" (<method> match, score <score>). Continue?` Wait for confirmation. Do not assume.

4. **If `entity` is null**, say so plainly: `No matter in the graph matches "<parsed name>". Confirm the matter name, or record one with: record_fact predicate=mentioned_in subject=<matter>.` Stop and wait for the user.

5. **Compose the brief from `recall_entity`'s returned data.** Pull, in this order:

   - **Deadlines.** Filter `facts[]` to entries whose `object.literal` starts with `deadline:` (case-insensitive). Parse the ISO date that follows the prefix. Each deadline becomes a line in the Deadlines section with days-remaining computed against today. **If a deadline date is in the past, emit `PAST DEADLINE` in capitals on that line.** See Flow B for the exact rendering — Flow A uses the same conventions.
   - **Opposing counsel.** Filter `facts[]` to entries with predicate `mentioned_in` whose `object.literal` contains `opposing counsel:` (case-insensitive). Surface verbatim.
   - **Latest filing.** Filter `facts[]` to entries with predicate `decided_in` OR predicate `mentioned_in` whose `object.literal` contains `filed:` (case-insensitive). Take the most recent by `recorded_at`. Surface verbatim.
   - **Outstanding tasks.** Filter `facts[]` to entries with predicate `blocked_by` OR predicate `depends_on`. Surface verbatim, one per line.
   - **Connected entities.** Use `neighbours[]` for related parties, sub-matters, related decisions.

6. **Render the brief.** See "Output format — Flow A" below.

7. **Stop.** Do not propose strategy. Do not summarise the merits. Do not draft. The brief is the deliverable.

## Flow B — deadline check

The user says some variant of `deadline check for the next 14 days`.

1. **Parse the window.** Extract the integer `N` from the trigger phrase. Treat as days. Reject zero and negatives — one sentence: `N must be a positive integer. Try: deadline check for the next 7 days.` Stop.

2. **Pull facts.** Call `recall_decisions` for every matter the user has on file is not practical at scale; instead, the implementation issues a single `recall_entity` against the literal sentinel name `"deadline-index"` IF the user maintains a deadline-index project entity in their graph, OR more commonly, queries the most recently active matter entities and aggregates their `facts[]` entries tagged `deadline:`. In v0.1.0 the simplest path is: the skill expects the user to record deadline facts under each matter entity with `object.literal` beginning `deadline:<ISO date>:<description>`. The skill calls `recall_entity` on each matter the user has touched in the last 90 days (via `recall_entity` with a name the user supplies for indexing) and collects `deadline:` facts. **If the user has not provided an index name in the trigger phrase, ask once**: `Which matter or matter-set should I scan? (Use "all" to scan every project entity touched in the last 90 days.)` Wait. Do not invent matters to scan.

3. **For each collected deadline fact**, parse the ISO date out of the `object.literal` prefix. Compute days-remaining = (deadline_date - today). Today is local-date; deadlines are stored as ISO calendar dates with no time component.

4. **Sort by date ascending.** Past deadlines first (most-overdue at top), then today, then future.

5. **Render the deadline list.** See "Output format — Flow B" below. **Past deadlines MUST be flagged with the literal string `PAST DEADLINE` in capitals, on the same line as the deadline.** Do not soften this. Do not say "you may want to check on this", "this appears to have slipped", "looks like this is overdue". The literal string `PAST DEADLINE` is non-negotiable.

6. **Stop.** Do not propose remediation. Do not draft motions to extend. The list is the deliverable.

## Flow C — email translation

The user says `translate this email for me` and either pastes the email in the same turn or says they will paste it.

1. **Ask for the email** only if it has not been provided in the same turn. One sentence: `Paste the email. I'll surface literal subtext and classify the register.` Wait.

2. **Check whether the translation-legal pack is available.** The pack is signalled by `mcp-translation` reporting `domain: legal` as a supported translation domain AND the pack being listed in the substrate's installed-plugin registry. (In the v0.1.0 reference implementation, this is checked via the runtime's plugin-availability table that the substrate populates at init.)

3. **Branch:**

   - **If `mcp-translation` + `translation-legal` are both available:** call `translate_incoming({ "text": "<the pasted email, verbatim>", "domain": "legal" })`. The pack's `literal-meaning`, `subtext`, and `tone` prompts apply on top of the base translation server. Render the response in the structure under "Output format — Flow C (with translation-legal)" below.

   - **If `mcp-translation` is available but `translation-legal` is not:** call `translate_incoming({ "text": "<the pasted email, verbatim>" })` without a domain hint. Surface the response, then add a one-line note: `Note: translation-legal pack not installed. Output is a generic literal translation; install translation-legal for legal-idiom subtext and register classification.`

   - **If `mcp-translation` is not available at all:** fall back to an in-skill literal translation. The output must follow the structure under "Output format — Flow C (in-skill fallback)" below. The skill itself produces the literal-meaning pass and a register classification using the inline prompts described in that section.

4. **Stop.** Do not propose a reply. Do not draft a response. The translated structure is the deliverable.

## Output format

### Flow A — matter brief

Strict "Answer First". First sentence ≤ 120 characters.

```
Matter brief — <matter name>. Last activity: <relative timestamp, e.g. "3 days ago, 2026-05-18">.

### Deadlines
- <ISO date> — <description> — <N> days remaining
- <ISO date> — <description> — PAST DEADLINE (<N> days overdue)

### Opposing counsel
- <verbatim fact text>

### Latest filing
- <verbatim fact text> (<recorded_at date>)

### Outstanding
- <verbatim fact text>
- <verbatim fact text>

### Connected
- <neighbour name> (<relationship>)
```

Rules:

- Sections appear in the order shown above. Empty sections are omitted entirely (no `### Deadlines` header if no deadline facts on file).
- Deadlines are sorted ascending by date. Past deadlines appear first, flagged with `PAST DEADLINE` in capitals.
- Facts are quoted verbatim from `recall_entity`'s `object.literal` field. Do not paraphrase. Do not summarise. Do not soften.
- Days-remaining is computed against today's local date. Today (zero days remaining) is rendered as `due today`.
- No closing exhortation. No "let me know if you need more". When the brief is rendered, stop.

### Flow B — deadline check

```
Deadline check — next <N> days. <M> deadline(s) on file.

- <ISO date> — <matter name> — <description> — PAST DEADLINE (<K> days overdue)
- <ISO date> — <matter name> — <description> — due today
- <ISO date> — <matter name> — <description> — <K> days remaining
```

Rules:

- One line per deadline. Order: past deadlines (most overdue first), then today, then future ascending.
- `PAST DEADLINE` is rendered in capitals, verbatim. Never softened, never paraphrased.
- The line `0 deadlines on file in the next <N> days.` is the only acceptable empty-list rendering. No "great, you have a clear week" or similar.

### Flow C — email translation (with translation-legal)

Surface `translate_incoming`'s response as:

```
Email translation — <inferred sender role, e.g. "outside counsel" or "unknown">.

### Explicit ask
<explicit_ask field, verbatim>

### Literal subtext
- <ambiguity span 1> — <note>
- <ambiguity span 2> — <note>

### Terms of art
- "<term 1>" — <effect, ending with "typically">
- "<term 2>" — <effect, ending with "typically">

### Register
<tone classification: e.g. "British-firm formal — hedged but courteous; close-of-play deadline is real">

### Recommended next action
<recommended_next_action.action> — <reason>
```

Rules:

- Quote `explicit_ask`, `legal_terms_of_art`, and `ambiguity.spans` verbatim from the translation-legal pack output. Do not paraphrase.
- Operational-effect descriptions for terms of art MUST end with `typically` (the pack enforces this; the skill preserves it).
- Register classification is one sentence, drawn from the pack's `tone` prompt output. No editorial framing.

### Flow C — email translation (in-skill fallback)

When `mcp-translation` is unavailable, run the literal-translation pass inline using these prompts:

1. **Literal meaning.** Identify each hedge, indirect ask, term of art, or institutional phrase. For each, output the literal operational meaning. Mark terms of art (e.g. `without prejudice`, `subject to contract`, `time of the essence`) explicitly; describe their typical operational effect and end the description with the word `typically`. Do NOT assert binding legal effect.

2. **Register classification.** One sentence classifying the tone (e.g. `British-firm formal`, `US BigLaw transactional`, `in-house collegial`, `litigation adversarial`). One sentence on whether deadlines or asks are real-with-etiquette-softening or genuinely soft.

Render as:

```
Email translation — in-skill fallback (translation-legal pack not installed).

### Literal subtext
- "<phrase from email>" — <literal meaning>
- "<phrase from email>" — <literal meaning>

### Terms of art
- "<term>" — <typical operational effect, ending with "typically">

### Register
<one-sentence classification>

Note: translation-legal pack would give you the structured ambiguity spans, confidence scores, and recommended-next-action surface. Install with: cp -r plugins/translation-legal <neurodock-plugins-dir>/.
```

Rules:

- Every term-of-art effect description ends with `typically`. The skill MUST NOT assert that any phrase definitively creates or extinguishes a legal right.
- The fallback never says "you should reply" or "I recommend"; it surfaces facts and stops.

## Do not

- Do not give legal advice. Ever. Not in any flow. Not in any output. The skill surfaces what the user recorded; it does not interpret it.
- Do not soften `PAST DEADLINE`. Not in Flow A, not in Flow B. The literal string `PAST DEADLINE` appears in capitals.
- Do not paraphrase facts returned by `recall_entity`. Quote the literal text.
- Do not invent deadlines, parties, or filings. If the graph has no facts on the matter, say so.
- Do not assert binding legal effect for any term of art. Operational effect descriptions end with `typically`.
- Do not propose a reply, draft a motion, or render any opinion on the merits.
- Do not call `record_fact` without explicit user opt-in. The cognitive graph is the user's notebook.
- Do not activate inside another skill's flow. Let it finish first.
- Do not use the words `should`, `must`, `obligated`, `liable`, `entitled`, `actionable`, or `merits` in any skill-generated commentary outside of verbatim quotes of user-recorded facts.
- Do not flower up the output. Lawyers respect precision; respect them by being terse.

## What this skill is not

- Not a legal-advice engine. It does not interpret statute, predict outcomes, or render opinions.
- Not a drafting tool. It does not produce pleadings, motions, contracts, or correspondence.
- Not a docketing system. It surfaces deadlines the user has recorded; it does not replace a court-rules calendaring product.
- Not a research tool. It does not look up case law, statute, or regulations.
- Not a clinical tool. The skill makes no claims about the user's neurotype.

## Examples

See `tests/`:

- `tests/01-matter-brief.md` — Flow A with a populated matter entity.
- `tests/02-deadline-check-past-deadline.md` — Flow B asserting `PAST DEADLINE` appears verbatim, no softening.
- `tests/03-translate-email.md` — Flow C calling through translation-legal.
