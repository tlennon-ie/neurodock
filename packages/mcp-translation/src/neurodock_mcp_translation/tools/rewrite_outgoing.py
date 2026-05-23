"""Implementation of the ``rewrite_outgoing`` tool.

v0.0.1 baseline: applies a small number of register-specific surface
transforms (open with a relational acknowledgement for 'warm', drop hedges for
'direct/concise', open with a question for 'clarifying') and then verifies
that all ``preserve_terms`` survive the transform. The structured prompt
returned alongside the baseline allows the caller's LLM to produce a stronger
rewrite while keeping the same preservation contract.
"""

from __future__ import annotations

from neurodock_mcp_translation.prompts import render_prompt
from neurodock_mcp_translation.types import (
    DiffSummary,
    ModelProvenance,
    PromptForLLMRefinement,
    RewriteOutgoingAnalysis,
    RewriteOutgoingEnvelope,
    RewriteOutgoingInput,
)

EVAL_CORPUS_SLICE = "packages/evals/corpora/translation/outgoing/v0.1.0/general.jsonl"

_OUTPUT_SCHEMA_REF = "packages/mcp-translation/schemas/rewrite_outgoing.schema.json"


def _strip_blunt_opener(text: str) -> tuple[str, list[str]]:
    """Drop the leading blunt-rejection opener, if present."""

    changes: list[str] = []
    lower = text.lower()
    for opener in ("strong nack.", "strong nack", "nack."):
        if lower.startswith(opener):
            # Preserve case of remaining text after the opener and a space/sep.
            remainder = text[len(opener) :].lstrip(" -—,.")
            changes.append("Removed opening rejection token")
            return remainder, changes
    return text, changes


def _baseline_rewrite_direct(text: str) -> tuple[str, list[str]]:
    rewritten, changes = _strip_blunt_opener(text)
    if rewritten.startswith("This is broken"):
        rewritten = rewritten.replace("This is broken.", "Heads up — this is broken.", 1)
        changes.append("Reframed bare diagnostic with a brief signal opener")
    return rewritten, changes


def _baseline_rewrite_warm(text: str) -> tuple[str, list[str]]:
    rewritten, changes = _strip_blunt_opener(text)
    if not rewritten.lower().startswith(("hey", "hi", "hello", "thanks", "happy")):
        rewritten = "Hey — " + rewritten[0].lower() + rewritten[1:] if rewritten else "Hey — "
        changes.append("Added relational opener")
    return rewritten, changes


def _baseline_rewrite_concise(text: str) -> tuple[str, list[str]]:
    rewritten, changes = _strip_blunt_opener(text)
    # Drop common hedges.
    for hedge in ("just ", "I think ", "i think ", "maybe ", "perhaps "):
        if hedge in rewritten:
            rewritten = rewritten.replace(hedge, "", 1)
            changes.append(f"Removed hedge {hedge.strip()!r}")
    return rewritten.strip(), changes


def _baseline_rewrite_formal(text: str) -> tuple[str, list[str]]:
    rewritten, changes = _strip_blunt_opener(text)
    rewritten = rewritten.replace("won't", "will not").replace("can't", "cannot")
    if "won't" not in text and "can't" not in text and rewritten == text:
        changes.append("No structural changes; tone read as already formal-leaning")
    elif rewritten != text:
        changes.append("Expanded contractions")
    return rewritten, changes


def _baseline_rewrite_clarifying(text: str) -> tuple[str, list[str]]:
    rewritten, changes = _strip_blunt_opener(text)
    if not rewritten.rstrip().endswith("?"):
        rewritten = (
            rewritten.rstrip(". ") + " — could you confirm the specific concern so I can respond?"
        )
        changes.append("Reframed as a clarifying question")
    return rewritten, changes


_REGISTER_BASELINES = {
    "direct": _baseline_rewrite_direct,
    "warm": _baseline_rewrite_warm,
    "concise": _baseline_rewrite_concise,
    "formal": _baseline_rewrite_formal,
    "clarifying": _baseline_rewrite_clarifying,
}


def _tone_shift_summary(register: str) -> str:
    return {
        "direct": (
            "Tightened to a direct register; removed any blunt rejection token "
            "and kept the underlying ask."
        ),
        "warm": (
            "Lifted warmth by opening with a relational acknowledgement; "
            "preserved the underlying ask."
        ),
        "concise": "Compressed to the minimum viable wording in the 'concise' register.",
        "formal": "Shifted to a formal register; expanded contractions where present.",
        "clarifying": (
            "Reframed as a clarifying question so the recipient can name the "
            "specific concern before responding."
        ),
    }[register]


def rewrite_outgoing(payload: RewriteOutgoingInput) -> RewriteOutgoingEnvelope:
    """Run the deterministic baseline and build the LLM-refinement envelope."""

    text = payload.text
    register = payload.target_register
    baseline = _REGISTER_BASELINES[register]
    rewritten, structural_changes = baseline(text)
    if not rewritten:  # safety net — never return empty text
        rewritten = text
        structural_changes.append("Baseline produced empty output; returned input unchanged")

    # Verify preserve_terms via exact substring match.
    preserved: list[str] = []
    unpreserved: list[str] = []
    for term in payload.preserve_terms or []:
        if term in rewritten:
            preserved.append(term)
        else:
            unpreserved.append(term)

    warnings: list[str] = []
    for missing in unpreserved:
        warnings.append(
            f"Term {missing!r} was not preserved verbatim in the baseline rewrite. "
            "Caller may retry via the LLM-refinement prompt or surface the gap to the user."
        )

    diff = DiffSummary(
        tone_shift=_tone_shift_summary(register),
        structural_changes=structural_changes or ["No structural changes from baseline"],
        warnings=warnings,
    )

    analysis = RewriteOutgoingAnalysis(
        rewritten=rewritten,
        preserved_terms=preserved,
        unpreserved_terms=unpreserved,
        diff_summary=diff,
        eval_corpus_slice=EVAL_CORPUS_SLICE,
        model_provenance=ModelProvenance(mode="unknown", provider="unknown", model="unknown"),
    )

    prompt_content = render_prompt(
        "rewrite_outgoing",
        text=text,
        channel=payload.channel or "generic",
        target_register=register,
        preserve_intent=str(payload.preserve_intent).lower(),
        preserve_terms="\n".join(f"- {term}" for term in (payload.preserve_terms or []))
        or "(none)",
        deterministic_summary=(
            f"rewritten = {rewritten!r}\n"
            f"preserved_terms = {preserved!r}\n"
            f"unpreserved_terms = {unpreserved!r}"
        ),
    )

    return RewriteOutgoingEnvelope(
        deterministic_analysis=analysis,
        prompt_for_llm_refinement=PromptForLLMRefinement(
            role="user",
            content=prompt_content,
            output_schema_ref=_OUTPUT_SCHEMA_REF,
        ),
        eval_corpus_slice=EVAL_CORPUS_SLICE,
    )
