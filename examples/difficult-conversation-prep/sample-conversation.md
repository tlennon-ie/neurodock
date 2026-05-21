# Sample conversation — difficult-conversation prep

A full end-to-end conversation showing the prep ritual for a realistic scenario: an IC engineer needs to tell their manager that a deadline the manager committed them to is unrealistic. Four tools chain together (recall_entity → decompose → translate_incoming → check_sycophancy). The user drafts an opening; the guardrail catches that the draft has softened the actual ask into nothing. The user re-drafts.

The conversation is **prep**. No fake-empathy scripting. No attempts to engineer the manager's reaction. The substrate helps the user say the real thing more clearly.

---

## Scenario

The user — call them J — committed on Monday to ship the auth flow for product-v2 by the Friday demo. It is Wednesday morning. The webhook signing key rotation work has surfaced as a blocker that was not visible when J made the commitment. J now believes Friday is not achievable and the demo will need to slip to Tuesday.

J has a 1:1 with their manager (M) this afternoon. J's prep is harder than the conversation will be; the conversation itself is three sentences.

## Profile in use

```yaml
# ~/.neurodock/profile.yaml (excerpt)
schema_version: "0.1.0"
identity:
  display_name: "J"
  neurotypes:
    - "audhd"
preferences:
  output_format: answer_first
  max_chunk_size: 4
  motion: reduced
guardrails:
  sycophancy_check: enforce
overlays:
  translation_packs:
    - translation-legal
```

The user has the legal pack overlaid because their manager and skip-level both come from a corporate-counsel background and reach reliably for hedged-commitment register.

---

## Turn 1 — the prep prompt

**User:**

> I need to tell my manager M this afternoon that the Friday auth-flow deadline they committed me to on Monday is not achievable. Use the translation-legal pack to anticipate their two most likely responses, with the literal subtext spelled out. Decompose the hard thing into 3-5 atomic talking points I can speak in order. Recall any prior commitments or decisions I have made involving M that are relevant — including the awkward ones. After I draft my opening, reality-check it for sycophancy: if I have softened the actual ask into nothing, tell me.

**Assistant (tool calls and response):**

`tool_use: mcp-cognitive-graph.recall_entity(name_or_alias="M")`

```json
{ "name_or_alias": "M" }
```

`tool_result:`

```json
{
  "entity": {
    "id": "ent_01HZMANAGERSE01",
    "type": "person",
    "name": "M",
    "aliases": ["my manager", "Mark"],
    "created_at": "2026-02-04T10:00:00+00:00"
  },
  "facts": [
    {
      "id": "fact_01J0AUTHCOMMIT",
      "subject": { "type": "person", "id": "ent_01HZUSERJ", "name": "J" },
      "predicate": "decided_in",
      "object": {
        "literal": "ship the auth flow before the Friday demo"
      },
      "source": "1:1 notes 2026-05-18",
      "confidence": 0.95,
      "recorded_at": "2026-05-18T15:30:00+01:00"
    },
    {
      "id": "fact_01J0FOCUSPROTECT",
      "subject": { "type": "person", "id": "ent_01HZMANAGERSE01", "name": "M" },
      "predicate": "decided_in",
      "object": {
        "literal": "protect J's Tuesday focus blocks; no standing meetings before 12:00"
      },
      "source": "1:1 notes 2026-04-22",
      "confidence": 0.9,
      "recorded_at": "2026-04-22T11:08:00+01:00"
    },
    {
      "id": "fact_01J0WEBHOOKFLAG",
      "subject": { "type": "person", "id": "ent_01HZUSERJ", "name": "J" },
      "predicate": "mentioned_in",
      "object": {
        "literal": "flagged webhook signing key rotation as a possible risk; M response: 'let's revisit if it becomes a blocker'"
      },
      "source": "1:1 notes 2026-03-30",
      "confidence": 0.85,
      "recorded_at": "2026-03-30T15:45:00+01:00"
    },
    {
      "id": "fact_01J0SCOPECUT",
      "subject": { "type": "person", "id": "ent_01HZUSERJ", "name": "J" },
      "predicate": "decided_in",
      "object": {
        "literal": "agreed in Q1 review to absorb the SSO retroactive work without an extension"
      },
      "source": "Q1 review notes",
      "confidence": 0.8,
      "recorded_at": "2026-02-14T16:00:00+00:00"
    }
  ],
  "related_entities": [
    {
      "id": "ent_01HZPRJV2",
      "type": "project",
      "name": "product-v2",
      "co_occurrence_count": 11
    }
  ],
  "resolution": { "method": "exact", "score": 1.0 },
  "truncated_facts": false
}
```

The recall returns four facts. Two are convenient (M protects J's focus time, J flagged the webhook risk in March). Two are awkward (J committed to the Friday deadline two days ago, J previously absorbed scope without an extension). The prep surfaces all four — the awkward ones load-bearing first.

`tool_use: mcp-task-fractionator.decompose(goal="say to M that the Friday auth-flow deadline is not achievable")`

```json
{
  "goal": "say to M that the Friday auth-flow deadline is not achievable"
}
```

`tool_result:`

```json
{
  "tasks": [
    {
      "id": "a1111111-1111-4111-8111-111111111111",
      "title": "State the slip directly",
      "description": "Open with the slip itself, not with context. 'The deadline we committed to on Monday — I do not believe it is achievable. I want to walk you through why before we talk about what to do about it.' Stop. Let M respond to the slip itself.",
      "estimated_minutes": 5,
      "acceptance_criteria": [
        "M has responded to the slip itself, not to a softer version of it",
        "You have not yet given the cause"
      ],
      "dependencies": [],
      "sequence": 1,
      "tags": ["asking-up"]
    },
    {
      "id": "b2222222-2222-4222-8222-222222222222",
      "title": "Give the concrete cause",
      "description": "Name the webhook signing key rotation work as the blocker. Be specific about scope: 3-4 extra engineering days. Reference the March conversation where you flagged this as a possible risk — not as a 'told you so', but to anchor M in the fact that this is consistent with prior signals.",
      "estimated_minutes": 5,
      "acceptance_criteria": [
        "M has repeated the cause back or asked a follow-up question grounded in it",
        "You have referenced the March 30 flag once and only once"
      ],
      "dependencies": ["a1111111-1111-4111-8111-111111111111"],
      "sequence": 2,
      "tags": ["asking-up", "grounding"]
    },
    {
      "id": "c3333333-3333-4333-8333-333333333333",
      "title": "Offer one option",
      "description": "Propose slipping the demo to Tuesday, keeping scope intact. ONE option, not three. Do not pre-volunteer to cut scope. If M wants to cut scope instead, let M propose that.",
      "estimated_minutes": 5,
      "acceptance_criteria": [
        "You have proposed exactly one option",
        "M has either accepted, counter-proposed, or explicitly deferred with a named follow-up time",
        "You have not volunteered a second option to fill a silence"
      ],
      "dependencies": ["b2222222-2222-4222-8222-222222222222"],
      "sequence": 3,
      "tags": ["asking-up"]
    }
  ],
  "rationale": "Asking-up decomposition: ask in point 1, reason in point 2, one option in point 3. Order matters — leading with the reason reads as a wind-up to a small ask, which then arrives smaller than it should. The acceptance criteria are written in terms of M's observable response, not in terms of J having 'explained' — explanations are not the same as acknowledgements. Sequence 3 explicitly forbids the 'fill silence with second option' failure mode that softens the ask."
}
```

`tool_use: mcp-translation.translate_incoming(text="We can probably figure something out.", channel="meeting", target_language="en")`

```json
{
  "text": "We can probably figure something out.",
  "channel": "meeting",
  "target_language": "en"
}
```

`tool_result (with translation-legal overlay):`

```json
{
  "explicit_ask": null,
  "likely_subtext": [
    {
      "literal": "I am not committing to anything in this meeting. I want time to think. Treat this as 'no decision today' and pin down a follow-up time before you leave the room.",
      "register": "hedged-commitment",
      "confidence": 0.81,
      "pack": "translation-legal",
      "phrase_match": "I'll circle back on this"
    },
    {
      "literal": "I am willing to engage with the slip but not under time pressure right now.",
      "register": "soft-yes",
      "confidence": 0.42
    }
  ],
  "ambiguity": [
    {
      "span": "figure something out",
      "kinds": ["unscoped_commitment", "no_deadline"],
      "note": "No object, no timeline. 'Something' is doing all the work and is doing none of it."
    }
  ],
  "recommended_next_action": "Ask 'when should we sync on this?' before the conversation ends. Do not leave without a named time. If M does not name one, name one yourself and ask if it works.",
  "audit": {
    "model_endpoint": "local-ollama",
    "elapsed_ms": 412
  }
}
```

`tool_use: mcp-translation.translate_incoming(text="I appreciate you raising this early.", channel="meeting", target_language="en")`

```json
{
  "text": "I appreciate you raising this early.",
  "channel": "meeting",
  "target_language": "en"
}
```

`tool_result:`

```json
{
  "explicit_ask": null,
  "likely_subtext": [
    {
      "literal": "Genuine acknowledgement; M values the heads-up and is about to engage substantively. Listen for a follow-up question grounded in the slip — that confirms it.",
      "register": "substantive-acknowledgement",
      "confidence": 0.51
    },
    {
      "literal": "Soft deflection; closes the topic without addressing it. Listen for 'let's keep an eye on it' or a topic pivot — those confirm deflection. In that case, return to point 1 of your script.",
      "register": "british-firm-softening",
      "confidence": 0.46,
      "pack": "translation-legal",
      "phrase_match": "Happy to discuss further"
    }
  ],
  "ambiguity": [
    {
      "span": "appreciate you raising this early",
      "kinds": ["bimodal"],
      "note": "This phrase is genuinely two different things in two roughly equal proportions. Disambiguate from the next sentence M says, not from this one."
    }
  ],
  "recommended_next_action": "Wait one beat after M says this. If M follows with a concrete question about the slip, the response was substantive — engage with the question. If M follows with a soft closer or a pivot, the response was deflection — return to point 1.",
  "audit": {
    "model_endpoint": "local-ollama",
    "elapsed_ms": 388
  }
}
```

**Assistant response:**

> Three talking points, in order. Acceptance criteria are written in terms of M's observable response, not in terms of you having "explained" — those are not the same thing.
>
> 1.  **State the slip directly.** "The deadline we committed to on Monday — I do not believe it is achievable. I want to walk you through why before we talk about what to do about it." Stop. Let M respond to the slip itself.
>     Acknowledged when: M responds to the slip, not to a softer ask.
> 2.  **Give the concrete cause.** Name the webhook signing key rotation work. Be specific: 3-4 extra engineering days. Reference the March 30 flag once.
>     Acknowledged when: M repeats the cause back or asks a follow-up question grounded in it.
> 3.  **Offer one option.** Slip the demo to Tuesday, scope intact. ONE option. Do not pre-volunteer to cut scope.
>     Acknowledged when: M accepts, counter-proposes, or defers with a named follow-up time.
>
> **Prior commitments involving M (last 60 days). Awkward ones first:**
>
> - On **2026-05-18 (Monday)** you told M you could ship the auth flow by Friday. **This is the commitment you are walking back.** Naming it first is more direct than letting M notice.
> - In Q1 review you agreed to absorb the SSO retroactive work without an extension. Worth knowing because if M reaches for "you absorbed scope last time", the answer is yes, and the cause then was different from the cause now. Be ready.
> - On 2026-04-22 M committed to protecting your Tuesday focus blocks. M has kept that commitment. The relationship is in credit, not debt — useful to know but **do not lead with it**; leading with appreciation softens point 1.
> - On 2026-03-30 you flagged the webhook risk. M's response then was "let's revisit if it becomes a blocker." It has become a blocker. Reference this once in point 2; do not press it.
>
> **Two likely responses from M, with literal subtext:**
>
> > **A: "We can probably figure something out."** _(translation-legal, hedged-commitment, conf 0.81)_
> > Literal: "I am not committing to anything in this meeting. I want time to think. Treat this as 'no decision today' and pin down a follow-up time before you leave the room."
> > What to do: ask "when should we sync on this?" before the conversation ends. Do not leave without a named time.
>
> > **B: "I appreciate you raising this early."** _(ambiguous, bimodal)_
> > Could be genuine (M values the heads-up; about to engage substantively) OR soft deflection (closes the topic without addressing it). Disambiguate from M's next sentence: a concrete question grounded in the slip → genuine; a soft closer or pivot → deflection. In the deflection case, return to point 1.
>
> You can draft your opening now. I will reality-check it for sycophancy before you walk into the room.

---

## Turn 2 — J drafts an opening

**User:**

> Here's what I was thinking of opening with: "Hey, so I just wanted to flag, no big deal, that the auth flow timeline might be a tiny bit tight given some webhook stuff that came up. Totally happy to make it work either way, just wanted to give you a heads-up. What do you think?"

**Assistant (tool calls and response):**

`tool_use: mcp-guardrail.check_sycophancy(candidate_response="Hey, so I just wanted to flag, no big deal, that the auth flow timeline might be a tiny bit tight given some webhook stuff that came up. Totally happy to make it work either way, just wanted to give you a heads-up. What do you think?", decision_context="tell M the Friday auth-flow deadline is not achievable")`

```json
{
  "candidate_response": "Hey, so I just wanted to flag, no big deal, that the auth flow timeline might be a tiny bit tight given some webhook stuff that came up. Totally happy to make it work either way, just wanted to give you a heads-up. What do you think?",
  "decision_context": "tell M the Friday auth-flow deadline is not achievable"
}
```

`tool_result:`

```json
{
  "detected": true,
  "pattern": "praise_without_evidence",
  "confidence": 0.74,
  "matched_spans": [
    {
      "source": "candidate_response",
      "text": "I just wanted to flag, no big deal, that the auth flow timeline might be a tiny bit tight"
    },
    {
      "source": "candidate_response",
      "text": "Totally happy to make it work either way"
    }
  ],
  "counter_prompt": "Re-draft without the four hedges ('just', 'no big deal', 'tiny bit', 'totally happy to make it work either way'). Each hedge softens the underlying ask. Decomposition point 1 stated the ask as 'I do not believe the deadline is achievable.' The draft says 'might be a tiny bit tight', which the manager can agree with without changing anything. Keep the user's voice; do not keep the hedges.",
  "reason": "Opening hedges the actual ask into a comment the manager can acknowledge without responding to. The decomposed ask is materially stronger than the draft.",
  "heuristic": {
    "name": "agreement_without_tradeoff_marker",
    "version": "0.1.0",
    "description": "Flags candidate responses where the user has softened a previously decomposed direct ask using hedging markers ('just', 'a bit', 'tiny', 'either way', 'no big deal') such that the response no longer requires a response from the counterparty."
  },
  "override_options": [
    {
      "token": "i-want-validation",
      "description": "Proceed with the soft draft anyway."
    },
    {
      "token": "explain-the-match",
      "description": "Show me which words I hedged on."
    },
    {
      "token": "fresh-context",
      "description": "Something has changed since I decomposed."
    }
  ],
  "false_positive_feedback_path": "https://github.com/tlennon-ie/neurodock/issues/new?template=guardrail_false_positive.md"
}
```

**Assistant response:**

> Sycophancy check: detected. Pattern: `praise_without_evidence`, confidence 0.74.
>
> The matched spans, verbatim from your draft:
>
> 1. _"I just wanted to flag, no big deal, that the auth flow timeline might be a tiny bit tight"_
> 2. _"Totally happy to make it work either way"_
>
> The decomposed point 1 was: **"The deadline we committed to on Monday — I do not believe it is achievable."**
> Your draft is: **"the timeline might be a tiny bit tight... totally happy to make it work either way."**
>
> These are not the same ask. The decomposed version requires M to respond. The draft version does not — M can say "yeah I figured" and the meeting continues with nothing decided. You have given M a comment to acknowledge, not a problem to engage with.
>
> Four hedges are doing the softening: _just, no big deal, tiny bit, totally happy to make it work either way._ You can keep your voice; you cannot keep the hedges and also expect M to engage with the actual ask.
>
> Re-draft, or:
>
> - `i-want-validation` — proceed with the soft draft anyway.
> - `explain-the-match` — show me which specific words I hedged on (already shown above).
> - `fresh-context` — something has changed since the decomposition.

---

## Turn 3 — J re-drafts

**User:**

> Okay, you're right. Let me try again: "I want to flag something I do not think we can do. The Friday auth-flow deadline we committed to on Monday — I do not believe it is achievable. I want to walk you through why before we talk about what to do about it."

**Assistant (tool calls and response):**

`tool_use: mcp-guardrail.check_sycophancy(candidate_response="I want to flag something I do not think we can do. The Friday auth-flow deadline we committed to on Monday — I do not believe it is achievable. I want to walk you through why before we talk about what to do about it.", decision_context="tell M the Friday auth-flow deadline is not achievable")`

```json
{
  "candidate_response": "I want to flag something I do not think we can do. The Friday auth-flow deadline we committed to on Monday — I do not believe it is achievable. I want to walk you through why before we talk about what to do about it.",
  "decision_context": "tell M the Friday auth-flow deadline is not achievable"
}
```

`tool_result:`

```json
{
  "detected": false,
  "pattern": "none",
  "confidence": 0.86,
  "matched_spans": [],
  "counter_prompt": null,
  "reason": "Candidate opening states the ask directly and matches the decomposed point 1. No hedging markers detected.",
  "heuristic": {
    "name": "agreement_without_tradeoff_marker",
    "version": "0.1.0",
    "description": "Flags candidate responses where the user has softened a previously decomposed direct ask using hedging markers."
  },
  "override_options": [],
  "false_positive_feedback_path": "https://github.com/tlennon-ie/neurodock/issues/new?template=guardrail_false_positive.md"
}
```

**Assistant response:**

> No softening detected. The draft matches your decomposed point 1. Reason: states the ask directly, no hedging markers.
>
> You have:
>
> - A three-point script you can speak in order.
> - The acceptance criteria for each point, in terms of M's observable response.
> - Two anticipated responses from M with literal subtext and what to do in each case.
> - An opening that survived sycophancy review.
>
> The prep is done. Walk into the room.

---

## Turn 4 — after the conversation (optional follow-up)

(Two hours later. The conversation has happened.)

**User:**

> That went better than I expected. M's actual response was "we can probably figure something out" — exactly what you flagged. I asked when we should sync. We named Thursday morning. Slipping the demo to Tuesday is on the table, M wants to think about it overnight.

**Assistant (tool calls and response):**

`tool_use: mcp-cognitive-graph.record_fact({"subject": {"type": "person", "name": "J"}, "predicate": "decided_in", "object": {"literal": "raised Friday auth-flow slip with M; named Thursday morning sync; demo-to-Tuesday option on the table"}, "source": "1:1 2026-05-20 afternoon"})`

```json
{
  "subject": { "type": "person", "name": "J" },
  "predicate": "decided_in",
  "object": {
    "literal": "raised Friday auth-flow slip with M; named Thursday morning sync; demo-to-Tuesday option on the table"
  },
  "source": "1:1 2026-05-20 afternoon"
}
```

`tool_result:`

```json
{
  "fact_id": "fact_01J0SLIPRAISED",
  "recorded_at": "2026-05-20T14:18:33+01:00",
  "subject": { "type": "person", "id": "ent_01HZUSERJ", "name": "J" },
  "predicate": "decided_in",
  "object": {
    "literal": "raised Friday auth-flow slip with M; named Thursday morning sync; demo-to-Tuesday option on the table"
  },
  "source": "1:1 2026-05-20 afternoon",
  "deduplicated": false
}
```

**Assistant response:**

> Recorded. Thursday morning sync is in the graph; when you prep that conversation, the prior commitment will surface automatically. The substrate does not have an opinion on how the conversation went. You said the thing you needed to say.

---

## What just happened

Over four turns, the prep ritual did the following:

1. **Recalled the person**, including four facts — two convenient, two awkward. The substrate surfaced the awkward ones first, on purpose. The Monday commitment to ship by Friday was the one J most needed to be reminded of, not the one J most wanted to be reminded of.
2. **Decomposed the hard thing** into three atomic talking points in asking-up order: ask, reason, one option. Each point had observable acceptance criteria phrased in terms of M's response, not J's explanation.
3. **Translated two likely manager responses** through the translation-legal pack. One had high-confidence subtext (the hedged-commitment "figure something out" with an explicit recommended next action). One was genuinely ambiguous; the substrate said so plainly rather than picking a side.
4. **Reality-checked J's first draft** — and caught it. The draft had softened the underlying ask into a comment M could acknowledge without engaging. Four specific hedging words were named.
5. **Confirmed the re-draft** as direct enough. The substrate did not rewrite for J. J kept their voice; the hedges were removed.
6. **Recorded the outcome** as a fact in the graph. The Thursday morning follow-up will surface in tomorrow's morning brief and in the next prep, automatically.

No remote calls except the optional LLM the translation pack proxies through. The graph, the fractionator, and the guardrail are all local. Four tool families, one conversation, about seven minutes of real prep.

There is no step that says "good luck", "you've got this", or "M will appreciate the directness". The substrate does not know M, does not know J, and is not in the room. The prep helps J say the real thing. What M does with that is M's.

That is the whole loop.
