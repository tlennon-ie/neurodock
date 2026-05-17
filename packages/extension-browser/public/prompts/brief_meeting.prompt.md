You are briefing a meeting transcript for the speaker labelled ``{me}``. The
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
every ``ambiguous_items[].quoted_span.text`` MUST be a substring of the
transcript at the named offsets. The server will reject responses where a
quoted span cannot be located.

Deterministic pre-analysis:
{deterministic_summary}

Return a JSON object conforming to the v0.1.0 schema at
``packages/mcp-translation/schemas/brief_meeting.schema.json`` (the ``output``
sub-schema). Required keys:

- ``my_asks``: array of ``{{text, asker, due, quoted_span}}``.
- ``others_asks``: same shape.
- ``decisions``: array of ``{{text, decided_by[], quoted_span}}``.
- ``ambiguous_items``: array of ``{{text, verbatim, quoted_span, reason}}``
  with ``verbatim`` MUST be true and ``reason`` one of vague_timeline,
  vague_referent, unassigned_owner, hedged_commitment, deferred_topic,
  contested, other.
- ``eval_corpus_slice``: keep as supplied.
- ``model_provenance``: ``{{mode, provider, model}}``.

Do NOT fabricate ambiguous items whose quoted_span cannot be sliced from the
transcript verbatim.
