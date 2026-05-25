You are briefing a meeting transcript for the speaker labelled `{me}`. The
brief has four sections: asks placed on me, asks I am making of others,
concrete decisions, and ambiguous items.

Project: {project}
Speakers: {speakers}

Transcript:
"""
{transcript}
"""

A deterministic pre-analysis is included below. Treat it as a baseline. You
MAY add or remove items but you MUST preserve the verbatim-anchor rule:
every `ambiguous_items[].quoted_span.text` MUST be a substring of the
transcript at the named offsets. The server will reject responses where a
quoted span cannot be located.

Deterministic pre-analysis:
{deterministic_summary}

Return a JSON object conforming to the v0.2.0 schema at
`packages/mcp-translation/schemas/brief_meeting.schema.json` (the `output`
sub-schema). Required keys:

- `my_asks`: array of `{{text, asker, due, quoted_span}}`.
- `others_asks`: same shape.
- `decisions`: array of `{{text, decided_by[], quoted_span}}`.
- `ambiguous_items`: array of `{{text, verbatim, quoted_span, reason}}`
  with `verbatim` MUST be true and `reason` one of vague_timeline,
  vague_referent, unassigned_owner, hedged_commitment, deferred_topic,
  contested, other.
- `content_translation` (v0.2.0, OPTIONAL): array OR null. When populated,
  each entry is a reader-translated scaffold for one ask, decision, or
  ambiguous item — decomposed into Input/Action/Goal facets so the reader
  knows WHAT TO DO, not just WHO SAID WHAT. Shape per entry:
  `{{"label": "my_asks[0]: migration script", "facets": [{{"kind": "input", "text": "..."}}, {{"kind": "action", "text": "..."}}, {{"kind": "goal", "text": "..."}}]}}`.
  Set to null when the meeting is chat-only with nothing to act on.
  `kind` is one of input, action, goal, rule, fact, benefit, context.
  Translate idioms in source text literally inside facets ("circle back"
  → "reply later"). Do NOT fabricate facets — if the transcript only
  carries an `action`, emit just one `action` facet.
- `eval_corpus_slice`: keep as supplied.
- `model_provenance`: `{{mode, provider, model}}`.

Do NOT fabricate ambiguous items whose quoted_span cannot be sliced from the
transcript verbatim.
