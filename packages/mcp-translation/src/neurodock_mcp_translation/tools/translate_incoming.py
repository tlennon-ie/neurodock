"""Implementation of the ``translate_incoming`` tool.

Returns a deterministic baseline analysis plus a structured prompt the caller
MAY execute against its own MCP-client LLM to refine the baseline.
"""

from __future__ import annotations

from neurodock_mcp_translation.heuristics.ambiguity import (
    AmbiguityHit,
    find_ambiguities,
)
from neurodock_mcp_translation.prompts import render_prompt
from neurodock_mcp_translation.types import (
    AmbiguityReport,
    AmbiguitySpan,
    ModelProvenance,
    NextAction,
    PromptForLLMRefinement,
    SubtextHypothesis,
    TranslateIncomingAnalysis,
    TranslateIncomingEnvelope,
    TranslateIncomingInput,
)

EVAL_CORPUS_SLICE = "packages/evals/corpora/translation/incoming/v0.1.0/general.jsonl"

_OUTPUT_SCHEMA_REF = "packages/mcp-translation/schemas/translate_incoming.schema.json"


def _explicit_ask(text: str) -> str | None:
    """Heuristic: a question-marked clause OR an imperative is an explicit ask."""

    if "?" in text:
        # Take the sentence containing the first question mark.
        for sentence in _split_sentences(text):
            if "?" in sentence:
                return _summarise_ask(sentence.strip())
    return None


def _split_sentences(text: str) -> list[str]:
    # Light-weight sentence split — good enough for the baseline.
    out: list[str] = []
    buf: list[str] = []
    for char in text:
        buf.append(char)
        if char in ".!?\n":
            piece = "".join(buf).strip()
            if piece:
                out.append(piece)
            buf = []
    tail = "".join(buf).strip()
    if tail:
        out.append(tail)
    return out


def _summarise_ask(sentence: str) -> str:
    """Trim trailing question mark; return a plain-language paraphrase."""

    cleaned = sentence.rstrip(" ?")
    cleaned = cleaned.lstrip("- ")
    # Cap length at 200 characters for the baseline paraphrase.
    if len(cleaned) > 200:
        cleaned = cleaned[:197] + "..."
    return cleaned


def _baseline_subtext(text: str, ambiguities: list[AmbiguityHit]) -> list[SubtextHypothesis]:
    """Return at most one baseline subtext hypothesis derived from ambiguity hits.

    The deterministic baseline intentionally stays modest; the LLM refines.
    """

    if not ambiguities:
        return []
    reasons = {hit.reason for hit in ambiguities}
    if "hedged_commitment" in reasons or "vague_timeline" in reasons:
        return [
            SubtextHypothesis(
                text=(
                    "The sender is signalling a soft commitment; the stated timeline "
                    "may slip without an explicit follow-up."
                ),
                confidence=0.55,
            )
        ]
    if "soft_request" in reasons:
        return [
            SubtextHypothesis(
                text=(
                    "The sender's polite framing may mask a stronger preference; "
                    "consider asking what specifically prompted the message."
                ),
                confidence=0.55,
            )
        ]
    if "implied_urgency" in reasons:
        return [
            SubtextHypothesis(
                text=(
                    "The sender is signalling that the ask has been outstanding "
                    "and a response is overdue, despite polite framing."
                ),
                confidence=0.55,
            )
        ]
    return []


def _baseline_next_action(
    text: str,
    explicit_ask: str | None,
    ambiguities: list[AmbiguityHit],
) -> NextAction:
    """Pick a coarse next-action label from the explicit ask + ambiguity hits."""

    reasons = {hit.reason for hit in ambiguities}
    if explicit_ask is None and "hedged_commitment" in reasons:
        return NextAction(
            action="set_reminder",
            reason=(
                "Treat the soft commitment as non-binding. Set a follow-up reminder "
                "so the conversation does not silently drop."
            ),
            draft_reply=None,
        )
    if explicit_ask is not None and "soft_request" in reasons:
        return NextAction(
            action="clarify",
            reason=(
                "The ask is softened; ask the sender to name the specific concern "
                "or stakeholders before agreeing to the request."
            ),
            draft_reply=None,
        )
    if explicit_ask is not None:
        return NextAction(
            action="reply",
            reason="The message contains an explicit ask; respond on its merits.",
            draft_reply=None,
        )
    if "implied_urgency" in reasons:
        return NextAction(
            action="acknowledge",
            reason="Polite-but-overdue framing — acknowledge receipt and give a concrete next-step.",
            draft_reply=None,
        )
    return NextAction(
        action="acknowledge",
        reason="No explicit ask; a brief acknowledgement keeps the thread alive.",
        draft_reply=None,
    )


def _deterministic_summary(
    explicit_ask: str | None,
    subtext: list[SubtextHypothesis],
    ambiguities: list[AmbiguityHit],
    action: NextAction,
) -> str:
    lines = [
        f"explicit_ask = {explicit_ask!r}",
        f"likely_subtext (count) = {len(subtext)}",
        f"ambiguity_hits = {len(ambiguities)}: "
        + ", ".join(f"{hit.reason}@{hit.start_char}-{hit.end_char}" for hit in ambiguities),
        f"recommended_action = {action.action}",
    ]
    return "\n".join(lines)


def translate_incoming(payload: TranslateIncomingInput) -> TranslateIncomingEnvelope:
    """Run the deterministic baseline and build the LLM-refinement envelope."""

    text = payload.text
    ambiguities = find_ambiguities(text)
    explicit_ask = _explicit_ask(text)
    subtext = _baseline_subtext(text, ambiguities)
    action = _baseline_next_action(text, explicit_ask, ambiguities)

    spans = [
        AmbiguitySpan(
            start_char=hit.start_char,
            end_char=hit.end_char,
            reason=hit.reason,
            note=hit.note,
        )
        for hit in ambiguities
    ]

    analysis = TranslateIncomingAnalysis(
        explicit_ask=explicit_ask,
        likely_subtext=subtext,
        ambiguity=AmbiguityReport(detected=bool(spans), spans=spans),
        recommended_next_action=action,
        eval_corpus_slice=EVAL_CORPUS_SLICE,
        model_provenance=ModelProvenance(mode="unknown", provider="unknown", model="unknown"),
    )

    thread_context_lines = (
        "\n".join(f"- {item}" for item in payload.thread_context)
        if payload.thread_context
        else "(none)"
    )

    prompt_content = render_prompt(
        "translate_incoming",
        text=text,
        channel=payload.channel or "generic",
        target_language=payload.target_language or "en",
        thread_context=thread_context_lines,
        deterministic_summary=_deterministic_summary(explicit_ask, subtext, ambiguities, action),
    )

    return TranslateIncomingEnvelope(
        deterministic_analysis=analysis,
        prompt_for_llm_refinement=PromptForLLMRefinement(
            role="user",
            content=prompt_content,
            output_schema_ref=_OUTPUT_SCHEMA_REF,
        ),
        eval_corpus_slice=EVAL_CORPUS_SLICE,
    )
