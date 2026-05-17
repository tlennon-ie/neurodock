# asd-meeting-translator

A NeuroDock skill that turns a meeting transcript into a four-section brief: decisions reached, explicit asks of the user, explicit asks of others, and ambiguous items quoted verbatim from the transcript. Decisions are written back into the local cognitive graph so future skills can recall them.

## When it fires

- The user types `/brief` or `/meeting`.
- The user's message contains `summarize this meeting`, `summarise this meeting`, `what did we agree`, or `what did I commit to`.
- The user references a file matching `*.transcript.txt` or `*.meeting.md`.
- The user pastes a long block of speaker-labelled prose with no other instruction — in that case the skill offers a brief rather than running silently.

## What the user sees

A short first line with four counts (decisions, asks of you, asks of others, ambiguous items), then four labelled sections in that order, then an optional "Prior decisions on this project (last 30 days)" section when a project was identified. Ambiguous items are quoted verbatim from the transcript with a reason code from the schema (`vague_timeline`, `vague_referent`, `unassigned_owner`, `hedged_commitment`, `deferred_topic`, `contested`, `other`).

## The verbatim guarantee

Every ambiguous item in the brief quotes the exact transcript span character-for-character. The `mcp-translation.brief_meeting` tool enforces this server-side: if the LLM returns a quoted span that cannot be located in the input transcript, the server returns `VERBATIM_ANCHOR_FAILED` and the skill surfaces the failure plainly rather than retrying. The reasoning is documented in `docs/decisions/0005-translation-tool-design.md` §4. Autistic users may rely on the brief to decide what they committed to in a meeting; a fabricated ambiguity is worse than no brief at all.

## What it reads and writes

Reads: `mcp-translation.brief_meeting`, `mcp-cognitive-graph.recall_decisions`.

Writes: `mcp-cognitive-graph.record_fact` — one row per decision with `predicate = "decided_in"`, scoped to the named project. Asks and ambiguous items are never written. The cap is ten writes per invocation. All writes are local-only.

## How to disable

Remove the trigger phrases from `~/.neurodock/profile.yaml` under `skills.asd-meeting-translator.triggers`, or set `skills.asd-meeting-translator.enabled: false`. Either change takes effect immediately.

## References

-  — launch skill #3 specification.
-  — Area 2 translation layer (the four-section meeting brief user story).
- `docs/decisions/0005-translation-tool-design.md` — verbatim-anchor enforcement and the four-tool decomposition.
- `packages/mcp-translation/schemas/brief_meeting.schema.json` — the wire contract.
- `SKILL.md` — the instructions the LLM follows when this skill activates.
- `tests/` — three executable invocation contracts replayed by CI.

Licensed AGPL-3.0-or-later.
