# difficult-conversation-prep

A prep ritual for a hard conversation you have already decided to have. Combines a translation pack (to decode how the other side is likely to respond), the task fractionator (to break what you want to say into atomic talking points), the cognitive graph (to remind you what you have already committed to), and the sycophancy guardrail (so the substrate does not soothe your draft into oblivion).

This is **prep**, not therapy. NeuroDock will not tell you whether to have the conversation, whether you are right, or how the other person should feel. It will help you say the real thing without burying the lede.

## Who this is for

Anyone in any role with a difficult conversation coming up where the **prep itself is harder than the conversation**. Common shapes:

- **Asking up** — telling a manager that a committed deadline is unrealistic, asking for a raise, pushing back on scope.
- **Delivering down** — giving feedback that someone has heard before but has not changed, raising a concern that has been mounting for weeks.
- **Peer-level** — surfacing a boundary issue with a co-founder, naming that a collaborator's behaviour is affecting your work.
- **Outside work** — landlord disputes, medical advocacy, the difficult family conversation. The substrate does not care what the relationship is; the tooling is the same.

It is especially aimed at:

- **Autistic readers** who want the conversation scripted enough that they are not improvising under stress, but not so scripted that it sounds wrong coming out of their mouth.
- **ADHD readers** who can hold the whole conversation in their head for thirty seconds but lose the through-line the moment the other person says something unexpected. Atomic points + one anchor line is the format that survives that.
- **Anyone with an inner critic loud enough to drown out the actual ask.** The sycophancy guardrail is pointing the other direction here: at the substrate's tendency to tell you everything will be fine. You do not need that. You need the prep.

It is **not** for:

- Deciding whether to have the conversation. That is your call. If you are still in the "should I" stage, the prep tools are the wrong layer.
- Scripting fake-empathy openings. The translation packs are tools for **understanding** the other side, not for engineering an emotional response from them. The skill will refuse to draft openings whose purpose is to manipulate rather than communicate.
- "Winning" the conversation. Difficult conversations are not adversarial games. The prep helps you say what you mean clearly; what the other person does with that is theirs.

## What you will combine

Four NeuroDock surfaces feed this ritual:

| Surface                                                                                                       | What it contributes                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Translation pack** (one of: `translation-legal`, `translation-sales`, `translation-customer-support`, etc.) | Decodes the _other_ side's likely responses. "We can probably figure something out" lands differently from a manager than from a peer; the pack spells out which.                                                                         |
| **`mcp-task-fractionator.decompose`**                                                                         | Breaks the hard thing you want to say into 3-5 atomic talking points, in order, with explicit "done" conditions. You stop when each point has been said and acknowledged, not when you feel resolved.                                     |
| **`mcp-cognitive-graph.recall_entity`**                                                                       | Surfaces prior commitments, prior conversations, and prior decisions involving the person you are talking to. Including the awkward ones — especially the awkward ones.                                                                   |
| **`mcp-guardrail.check_sycophancy`**                                                                          | Reality-checks your draft. When your "I need to push back on the deadline" turns into "just wanted to flag that the timeline might be a stretch, no pressure though, totally happy to make it work either way", the guardrail catches it. |

These are independent tools. You can run any one of them alone. The point of this walkthrough is the _sequence_ — they are most useful together, and in this order.

## One-time setup

### 1. Overlay the relevant translation pack

Pick the pack that fits the **other side's professional register**, not your own:

- Talking to a manager, a board member, or anyone in a structured corporate hierarchy → `translation-legal` works well for the hedged-commitment vocabulary even outside law (`"I'll circle back"`, `"happy to discuss"`, `"take this offline"`).
- Talking to a vendor, an account manager, a partnerships lead, or anyone whose job involves selling you something → `translation-sales`.
- Receiving difficult feedback from a customer, or preparing to give it from a support role → `translation-customer-support`.

Install one (or several) per the pack's README. The substrate auto-discovers plugins at `plugins/<name>/` after a client restart.

If your conversation crosses registers (e.g. a customer-support escalation that has been kicked up to legal), overlay both packs. The phrasebooks merge; no conflict.

### 2. Confirm the four MCP servers are wired

This walkthrough assumes you have:

- `neurodock-mcp-cognitive-graph` (for `recall_entity`)
- `neurodock-mcp-task-fractionator` (for `decompose`)
- `neurodock-mcp-translation` (the engine the translation packs plug into)
- `neurodock-mcp-guardrail` (for `check_sycophancy`)

If you do not yet have those wired, `examples/claude-desktop/` is the install path; come back here once the four show up green in your client.

### 3. (Optional) Pick a profile that suits the prep

The default profile is fine. If you are autistic and want the script tighter, `profiles/audhd.yaml` defaults to `output_format: answer_first` and a smaller `max_chunk_size` — useful when you do not want the substrate spreading the points over a wall of explanation. If you are ADHD and want one anchor line you can hold in your head, the `profiles/adhd.yaml` defaults are already in that shape.

## The prep prompt

Paste this into a fresh Claude conversation. Replace the bracketed parts; everything else is the literal text.

> I need to tell [PERSON] that [THE HARD THING]. Use the [PACK] translation pack to anticipate their two most likely responses, with the literal subtext spelled out. Decompose the hard thing itself into 3-5 atomic talking points I can speak in order. Recall any prior commitments or decisions I have made to [PERSON] that are relevant — including the awkward ones. After I draft my opening, reality-check it for sycophancy: if I have softened the actual ask into nothing, tell me.

That is the whole prompt. The variability is in the three bracketed fields; the structure of the prep is fixed.

**Two important constraints on the prompt:**

- It explicitly asks for the **awkward** prior commitments, not just the convenient ones. If you committed to ship by Friday and you are now telling your manager Friday will slip, the prep needs to remind you of the Friday commitment, not skip it because it makes the conversation harder.
- It explicitly asks the guardrail to be **pointed at your draft**, not at the substrate's response. The sycophancy heuristics work in both directions — used here, they catch the people-pleasing in your own writing before it leaves your laptop.

## What happens under the hood

When Claude receives the prompt with the four servers connected, it walks roughly this sequence:

1. **Recall the person.** Calls `mcp-cognitive-graph.recall_entity(name_or_alias="[PERSON]")`. Reads the returned facts list. Filters to commitments (`predicate: "decided_in"`), reporting relationships (`predicate: "reports_to"`), and recent mentions. **Does not filter out awkward facts.** Includes commitments you made that point the opposite direction from the conversation you are about to have — those are the ones you most need to be reminded of.

2. **Decompose the hard thing.** Calls `mcp-task-fractionator.decompose(goal="say to [PERSON] that [THE HARD THING]")`. Returns 3-5 atomic talking points with acceptance criteria phrased as "this point has been said and acknowledged when..." rather than "I have explained this when...". The difference matters: acknowledgement is observable from outside your head; "explained" is not.

3. **Translate likely responses.** For each of the two most likely responses the model anticipates (e.g. `"we can probably figure something out"`, `"let me think about this and get back to you"`), calls `mcp-translation.translate_incoming(text=<response>, channel="meeting")` with the overlay pack loaded. Returns each response's likely literal subtext plus an ambiguity score. **Caps at two responses.** Anticipating five makes the prep noisy and reduces it to "what if they say literally anything".

4. **You draft your opening.** The substrate stops and asks you to write the first thing you would say.

5. **Reality-check your draft.** Calls `mcp-guardrail.check_sycophancy(candidate_response=<your draft>, decision_context="[THE HARD THING]")`. If the heuristic detects `praise_without_evidence` or `escalating_validation` patterns _in your own writing_ — opening with "I just wanted to say I really appreciate everything you do" before pushing back on a deadline, for example — it surfaces the matched span and a counter-prompt suggesting a more direct re-draft. You can ignore it (the `i-want-validation` override token explicitly exists). The substrate does not rewrite your draft for you.

The substrate stops there. There is no step 6 where it tells you to "go get 'em". Difficult conversations are not pep talks.

Nothing in this flow calls a remote service except the optional LLM the translation pack proxies through; the graph and the fractionator are local. The guardrail is local.

## Sample output

A realistic prep, mid-week. The user is an IC engineer who needs to tell their manager that a committed deadline is unrealistic. Three atomic points, two anticipated manager responses with literal subtext, one prior awkward commitment surfaced, and one sycophancy intervention catching a softened draft.

```
Three talking points, in order:

  1. State the slip directly: "The deadline we committed to on Monday — I do
     not believe it is achievable. I want to walk you through why before we
     talk about what to do about it."
     Acknowledged when: M responds to the slip itself, not to a softer ask.

  2. Give the concrete reason: the webhook signing key rotation work
     surfaced late and is blocking the auth flow. Estimate: 3-4 extra days.
     Acknowledged when: M repeats the cause back or asks a follow-up
     question grounded in it.

  3. Offer one option, not three. Recommend slipping the demo to Tuesday
     and keeping the rest of the scope intact. Do not pre-volunteer to
     cut scope; let M propose that if M wants it.
     Acknowledged when: M either accepts the option, counter-proposes,
     or explicitly defers the decision with a named follow-up time.

Prior commitments involving M (last 60 days):
  - On 2026-05-13 you told M you could ship the auth flow by the demo.
    THIS IS THE COMMITMENT YOU ARE NOW WALKING BACK. Naming it first
    is more direct than letting M notice.
  - On 2026-04-22 M committed to protecting your Tuesday focus blocks.
    Worth knowing: M has kept that commitment. The relationship is in
    credit, not debt.
  - On 2026-03-30 you flagged the webhook work as a possible risk.
    M's response at the time was "let's revisit if it becomes a blocker."
    It has become a blocker. You are revisiting it. This is consistent
    with the prior conversation, not a surprise.

Two likely responses from M, with literal subtext:

  Response A: "We can probably figure something out."
    Pack: translation-legal, register: hedged-commitment.
    Literal: "I am not committing to anything in this meeting. I want time
    to think. Treat this as 'no decision today' and pin down a follow-up
    time before you leave the room."
    What to do: ask "when should we sync on this?" before the conversation
    ends. Do not leave without a named time.

  Response B: "I appreciate you raising this early."
    Pack: translation-legal, register: british-firm-softening.
    Literal: Ambiguous. Could be genuine (M values the heads-up and is
    about to engage substantively) OR could be a soft-deflection that
    closes the topic without addressing it. Listen for what comes next:
    if M follows with a concrete question about the slip, it was
    genuine; if M follows with "let's keep an eye on it" or pivots
    topic, it was deflection. In the deflection case, return to point 1.

---
You can draft your opening now. I will reality-check it for sycophancy
before you walk into the room.
```

Then the user drafts an opening like:

> "I just wanted to flag, no big deal, that the auth flow timeline might be a tiny bit tight, totally happy to make it work either way."

And the guardrail catches it:

```
Sycophancy check: detected
Pattern: praise_without_evidence (confidence 0.74)
Matched span: "I just wanted to flag, no big deal, that the auth flow
timeline might be a tiny bit tight"

Reason: Opening hedges the actual ask into something that does not require
a response. The point you decomposed in step 1 was "I do not believe the
deadline is achievable." Your draft says "might be a tiny bit tight" —
which M can agree with without changing anything.

Suggested counter-direction: re-draft without the four hedges
("just", "no big deal", "tiny bit", "totally happy to make it work").
You can keep your voice; you cannot keep the hedges and also expect M
to engage with the actual ask.

Override tokens available:
  - i-want-validation       (proceed with the soft draft anyway)
  - explain-the-match       (show me which words I hedged on)
  - fresh-context           (something has changed since I decomposed)
```

This is the whole prep. About five minutes of real attention; the rest of the day-of conversation is in the room.

## Variations

### Direction adjustments

The decomposition shape changes by direction. The substrate detects this from how you phrase the goal.

- **Asking up** (you → manager, you → board, etc.): the decompose call typically returns 3 points with the _ask_ in point 1, the _reason_ in point 2, and _one option_ in point 3. Do not lead with the reason; managers in delivery mode read a long lead-up as a wind-up to a small ask.
- **Delivering down** (you → report, you → mentee): typically 4-5 points, with _the specific behaviour_ in point 1, _the observable impact_ in point 2, _what you have already tried_ in point 3, _the request_ in point 4, and an optional _open invitation_ in point 5. The order matters: behaviour before impact, request before invitation.
- **Peer-level** (co-founder, collaborator, friend at work): typically 3 points, with _what you have noticed_ in point 1, _what you need_ in point 2, and _what you are not asking for_ in point 3. The last point is unusual but earns its place — peer conversations spiral fastest when one side starts inferring asks the other did not make.

You can override the shape by adding a clause to the prompt: `"decompose this as a delivering-down conversation"` or `"...as a peer-level conversation"`.

### Neurotype-specific tweaks

- **Autistic readers** sometimes want the talking points _scripted verbatim_, not just summarised. Add `"draft each point as the exact sentence I would say"` to the prompt. The substrate then returns sentence-level scripts instead of summary bullets. The acceptance criteria stay the same.
- **ADHD readers** sometimes want a _one-line anchor_ they can hold in their head if the points blur in the moment. Add `"and give me a single sentence I can return to if I lose the thread"`. The substrate returns the talking points plus one anchor line (typically a re-statement of point 1 in your own voice).
- **AuDHD readers** sometimes want both: verbatim points _and_ an anchor line. The prompt clauses stack.

### Prep with no graph history

If you are using this for a conversation with someone the graph has never seen — a new manager, a customer you have not corresponded with before, a landlord — the `recall_entity` call returns `entity: null`. The prep does not error. It just skips the "prior commitments" section and notes it explicitly:

> No prior commitments recorded with [PERSON]. This is a first conversation from the graph's perspective. If that is wrong, you can record context first with `record_fact(...)` and re-run; otherwise proceed.

This is intentional. The brief is your memory, not a synthetic one.

### Multi-side conversations

For a conversation involving more than two people (a 3-way escalation, a panel review, a difficult family meeting with several attendees), run `recall_entity` for each person you can name. The prep returns a prior-commitments section per person. Decomposition still produces one ordered talking-point list — the conversation is one conversation regardless of how many people are in the room — but the anticipated responses can be tagged per person.

## Pairing

- **[`plugins/translation-legal/`](../../plugins/translation-legal/)** — for conversations with managers, board members, and corporate hierarchies. The hedged-commitment phrasebook is the most-used part of the prep when asking up.
- **[`plugins/translation-sales/`](../../plugins/translation-sales/)** — for conversations with vendors, account managers, and partnerships leads. Decodes deal-stage gatekeeping and polite stalling.
- **[`plugins/translation-customer-support/`](../../plugins/translation-customer-support/)** — for both giving and receiving difficult feedback in a support context. Has both inbound and outbound phrasebooks.
- **[`plugins/translation-hiberno-english/`](../../plugins/translation-hiberno-english/)** — particularly useful for non-Irish speakers reading Irish indirectness (a "that would be grand" is doing a lot of work).
- **[`packages/skills/asd-meeting-translator/`](../../packages/skills/asd-meeting-translator/)** — the in-tree skill that supports the translate-incoming flow at meeting scale. Useful for the post-conversation debrief: what was actually said, what was meant.
- **[`packages/skills/audhd-context-recovery/`](../../packages/skills/audhd-context-recovery/)** — if the conversation is part of a thread you have been away from for more than a few days, run this first to surface what happened last time before you prep.

## What this is NOT

- **Not therapy.** The substrate does not have opinions about whether your relationship with [PERSON] is healthy, whether you should leave the job, or whether the conversation is going to go well. It helps with the words. The words are not the conversation.
- **Not advice on whether to have the conversation.** If you are still in the "should I" stage, the answer the substrate gives will be useless, because the prep tools assume the decision is made. Make the decision first, then prep.
- **Not a script generator that helps you manipulate the other side.** The translation packs decode register, not vulnerabilities. The substrate will refuse to draft openings whose purpose is to engineer a specific emotional response in the other person rather than communicate clearly. "Help me word this so they feel guilty enough to agree" is not a prompt this skill answers.
- **Not a way to feel better about the conversation in advance.** The sycophancy guardrail exists specifically to prevent that. If the substrate consoles you, that is a bug — file an issue.
- **Not a substitute for HR, mediation, or legal counsel in conversations that need them.** If you are prepping a workplace harassment conversation, a redundancy notice, a separation conversation, or anything where the legal stakes are non-trivial, the substrate is one input among many. It is not the only one.

## A note on tone

This walkthrough is written carefully because the territory is sensitive. The translation packs translate; they do not diagnose the people they describe. The decomposition decomposes; it does not script feelings the user does not feel. The guardrail catches _the user's own people-pleasing_; it does not catch the other person's.

There are two people in any difficult conversation. The tooling here is for the one who is reading this — that is the only side it can help with. The other person is not in the room, has not consented to being decoded, and is not the substrate's user. Treat the prep accordingly: as a way to be clearer about what _you_ mean, not a way to be cleverer about what _they_ mean.

## See also

- [`sample-conversation.md`](./sample-conversation.md) — a standalone end-to-end conversation showing the full prep with realistic tool calls and outputs for the deadline-slip scenario.
- [MANIFESTO.md](../../MANIFESTO.md) — particularly the principle on plain speech. The prep here is grounded in that.
- [`docs/decisions/0005-translation-tool-design.md`](../../docs/decisions/0005-translation-tool-design.md) and [`docs/decisions/0006-guardrail-tool-design.md`](../../docs/decisions/0006-guardrail-tool-design.md) — the two ADRs this walkthrough leans on hardest.
