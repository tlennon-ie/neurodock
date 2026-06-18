# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Implementation of the ``brief_meeting`` tool.

Partitions a transcript into:

- ``my_asks``: asks placed on ``input.me``.
- ``others_asks``: asks ``input.me`` (or third parties) place on others.
- ``decisions``: lines that look like a concrete commitment.
- ``ambiguous_items``: lines flagged by the ambiguity detector, each anchored
  to a verbatim transcript span.

Per ADR 0005 §5 the server enforces the verbatim-anchor rule on every
ambiguous item: ``quoted_span.text`` MUST slice from the transcript at the
named offsets, or the server raises ``VerbatimAnchorFailedError`` and the
caller's MCP client returns ``VERBATIM_ANCHOR_FAILED``.
"""

from __future__ import annotations

from neurodock_mcp_translation.heuristics.quote_extractor import (
    LineHit,
    TranscriptLine,
    find_asks,
    find_decisions,
    find_due_hint,
    index_lines,
)
from neurodock_mcp_translation.heuristics.quote_extractor import (
    find_ambiguities as find_transcript_ambiguities,
)
from neurodock_mcp_translation.prompts import render_prompt
from neurodock_mcp_translation.shaping import apply_shaping
from neurodock_mcp_translation.types import (
    AmbiguousItem,
    AmbiguousReason,
    Ask,
    BriefMeetingAnalysis,
    BriefMeetingEnvelope,
    BriefMeetingInput,
    Decision,
    ModelProvenance,
    PromptForLLMRefinement,
    QuotedSpan,
)

EVAL_CORPUS_SLICE = "packages/evals/corpora/translation/meetings/v0.1.0/general.jsonl"

_OUTPUT_SCHEMA_REF = "packages/mcp-translation/schemas/brief_meeting.schema.json"


class VerbatimAnchorFailedError(RuntimeError):
    """Raised when a quoted_span fails the verbatim-anchor check.

    Per ADR 0005 §5: the server rejects rather than fixing up. The FastMCP
    server boundary translates this into the schema's ``VERBATIM_ANCHOR_FAILED``
    error code.
    """


def _span_for_line(line: TranscriptLine, transcript: str) -> QuotedSpan:
    """Build a verbatim QuotedSpan from a line; verify it slices cleanly."""

    sliced = transcript[line.start_char : line.end_char]
    if sliced != line.text:
        raise VerbatimAnchorFailedError(
            f"Line index drifted: span {line.start_char}-{line.end_char} does not match line.text"
        )
    return QuotedSpan(start_char=line.start_char, end_char=line.end_char, text=line.text)


def _is_addressed_to_me(line: TranscriptLine, me: str) -> bool:
    """Best-effort: an ask is 'on me' if 'me' is named in the asking line."""

    return me.lower() in line.text.lower() and line.speaker != me


def _is_made_by_me(line: TranscriptLine, me: str) -> bool:
    return line.speaker == me


def _ask_text(line: TranscriptLine) -> str:
    """Strip the ``Speaker:`` prefix from the line for the paraphrase."""

    if line.speaker is not None:
        prefix_end = line.text.find(":")
        if prefix_end >= 0:
            return line.text[prefix_end + 1 :].strip()
    return line.text.strip()


def _classify_asks(hits: list[LineHit], me: str, transcript: str) -> tuple[list[Ask], list[Ask]]:
    """Split ask hits into my_asks (placed on me) and others_asks (everything else)."""

    my_asks: list[Ask] = []
    others_asks: list[Ask] = []
    for hit in hits:
        line = hit.line
        text = _ask_text(line)
        asker = line.speaker
        due = find_due_hint(line.text)
        ask = Ask(
            text=text,
            asker=asker,
            due=due,
            quoted_span=_span_for_line(line, transcript),
        )
        if _is_made_by_me(line, me):
            others_asks.append(ask)
        elif _is_addressed_to_me(line, me):
            my_asks.append(ask)
        else:
            others_asks.append(ask)
    return my_asks, others_asks


def _classify_decisions(hits: list[LineHit], transcript: str) -> list[Decision]:
    decisions: list[Decision] = []
    for hit in hits:
        line = hit.line
        text = _ask_text(line)
        decided_by = [line.speaker] if line.speaker else []
        decisions.append(
            Decision(
                text=text,
                decided_by=decided_by,
                quoted_span=_span_for_line(line, transcript),
            )
        )
    return decisions


def _classify_ambiguities(hits: list[LineHit], transcript: str) -> list[AmbiguousItem]:
    items: list[AmbiguousItem] = []
    for hit in hits:
        line = hit.line
        reason: AmbiguousReason = hit.matched_label  # type: ignore[assignment]
        text = _ask_text(line) or line.text
        items.append(
            AmbiguousItem(
                text=text,
                verbatim=True,
                quoted_span=_span_for_line(line, transcript),
                reason=reason,
            )
        )
    return items


def _enforce_verbatim_anchors(items: list[AmbiguousItem], transcript: str) -> None:
    """Validate every ambiguous item's quoted_span against the transcript."""

    for item in items:
        span = item.quoted_span
        if span.start_char >= span.end_char:
            raise VerbatimAnchorFailedError(
                f"Span {span.start_char}-{span.end_char} is empty or inverted"
            )
        if span.end_char > len(transcript):
            raise VerbatimAnchorFailedError(
                f"Span {span.start_char}-{span.end_char} exceeds transcript length {len(transcript)}"
            )
        sliced = transcript[span.start_char : span.end_char]
        if sliced != span.text:
            raise VerbatimAnchorFailedError(
                f"Span {span.start_char}-{span.end_char} text mismatch: "
                f"transcript has {sliced!r}, item has {span.text!r}"
            )


def _deterministic_summary(
    my_asks: list[Ask],
    others_asks: list[Ask],
    decisions: list[Decision],
    ambiguous: list[AmbiguousItem],
) -> str:
    return "\n".join(
        [
            f"my_asks ({len(my_asks)}): " + "; ".join(ask.text[:60] for ask in my_asks),
            f"others_asks ({len(others_asks)}): " + "; ".join(ask.text[:60] for ask in others_asks),
            f"decisions ({len(decisions)}): "
            + "; ".join(decision.text[:60] for decision in decisions),
            f"ambiguous_items ({len(ambiguous)}): "
            + "; ".join(item.text[:60] for item in ambiguous),
        ]
    )


def brief_meeting(payload: BriefMeetingInput) -> BriefMeetingEnvelope:
    """Run the deterministic baseline and build the LLM-refinement envelope."""

    transcript = payload.transcript
    me = payload.me

    lines = index_lines(transcript)

    ask_hits = find_asks(lines)
    decision_hits = find_decisions(lines)
    ambiguity_hits = find_transcript_ambiguities(lines)

    # An ask line that also resolves into a decision (e.g. "Can you own X?" / "Yes — I'll have it
    # by Wednesday") becomes both an ask and a decision in the baseline; the LLM refinement may
    # collapse them.
    my_asks, others_asks = _classify_asks(ask_hits, me, transcript)
    decisions = _classify_decisions(decision_hits, transcript)
    ambiguous = _classify_ambiguities(ambiguity_hits, transcript)

    # Enforce verbatim anchors on ambiguous_items (the ADR §5 requirement).
    _enforce_verbatim_anchors(ambiguous, transcript)

    analysis = BriefMeetingAnalysis(
        my_asks=my_asks,
        others_asks=others_asks,
        decisions=decisions,
        ambiguous_items=ambiguous,
        eval_corpus_slice=EVAL_CORPUS_SLICE,
        model_provenance=ModelProvenance(mode="unknown", provider="unknown", model="unknown"),
    )

    speakers_block = (
        "\n".join(f"- {speaker}" for speaker in payload.speakers)
        if payload.speakers
        else "(unknown)"
    )

    prompt_content = render_prompt(
        "brief_meeting",
        transcript=transcript,
        me=me,
        project=payload.project or "(unspecified)",
        speakers=speakers_block,
        deterministic_summary=_deterministic_summary(my_asks, others_asks, decisions, ambiguous),
    )

    # ADR 0012: append the per-neurotype addendum AFTER the schema block. Absent
    # both reader_context and a profile, this is a no-op (byte-identical content).
    prompt_content = apply_shaping(prompt_content, "brief_meeting", payload.reader_context)

    return BriefMeetingEnvelope(
        deterministic_analysis=analysis,
        prompt_for_llm_refinement=PromptForLLMRefinement(
            role="user",
            content=prompt_content,
            output_schema_ref=_OUTPUT_SCHEMA_REF,
        ),
        eval_corpus_slice=EVAL_CORPUS_SLICE,
    )
