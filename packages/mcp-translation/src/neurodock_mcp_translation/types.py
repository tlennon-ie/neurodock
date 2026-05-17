"""Pydantic models for translation tool inputs, outputs, and envelopes.

These models mirror the JSON Schemas under
``packages/mcp-translation/schemas/`` (the wire contract from ADR 0005). The
v0.0.1 tool response is an *envelope* wrapping the v0.1.0 output shape under
``deterministic_analysis``, plus a ``prompt_for_llm_refinement`` field that the
caller's MCP client MAY execute against its configured LLM.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# ---------------------------------------------------------------------------
# Shared enums (mirror schemas)

Channel = Literal[
    "email",
    "slack",
    "linear",
    "github",
    "notion",
    "gdocs",
    "outlook",
    "generic",
]

TargetRegister = Literal["direct", "warm", "formal", "concise", "clarifying"]

AmbiguityReason = Literal[
    "soft_request",
    "vague_timeline",
    "vague_referent",
    "hedged_commitment",
    "implied_urgency",
    "implied_blame",
    "passive_voice_actor",
    "rhetorical_question",
    "other",
]

NextActionEnum = Literal[
    "reply",
    "clarify",
    "acknowledge",
    "set_reminder",
    "escalate",
    "ignore",
    "defer",
]

ToneAxisName = Literal["directness", "warmth", "urgency"]

ProvenanceMode = Literal["local", "cloud", "unknown"]

AmbiguousReason = Literal[
    "vague_timeline",
    "vague_referent",
    "unassigned_owner",
    "hedged_commitment",
    "deferred_topic",
    "contested",
    "other",
]


# ---------------------------------------------------------------------------
# Base model (forbid extras — schemas use additionalProperties: false)


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---------------------------------------------------------------------------
# Shared output fragments


class ModelProvenance(_Base):
    mode: ProvenanceMode
    provider: str
    model: str


class PromptForLLMRefinement(_Base):
    """Structured prompt the caller's MCP client MAY execute.

    The caller's client receives this envelope, runs its own LLM (Claude /
    Ollama / OpenAI / ...) against ``content``, asks for output conforming to
    the JSON Schema at ``output_schema_ref``, then SHOULD replace this tool
    response's ``deterministic_analysis`` with the LLM-refined object.
    """

    role: Literal["user"] = "user"
    content: str
    output_schema_ref: str = Field(
        description=(
            "Path identifier of the JSON Schema the LLM output should conform "
            "to (relative to the repo root, e.g. "
            "'packages/mcp-translation/schemas/translate_incoming.schema.json')."
        ),
    )


# ---------------------------------------------------------------------------
# translate_incoming


class TranslateIncomingInput(_Base):
    text: str = Field(min_length=1, max_length=8000)
    channel: Channel | None = None
    thread_context: list[str] | None = Field(default=None, max_length=20)
    target_language: str | None = None


class SubtextHypothesis(_Base):
    text: str = Field(min_length=1, max_length=1000)
    confidence: float = Field(ge=0.0, le=1.0)


class AmbiguitySpan(_Base):
    start_char: int = Field(ge=0)
    end_char: int = Field(ge=0)
    reason: AmbiguityReason
    note: str | None = Field(default=None, max_length=500)


class AmbiguityReport(_Base):
    detected: bool
    spans: list[AmbiguitySpan]


class NextAction(_Base):
    action: NextActionEnum
    reason: str = Field(min_length=1, max_length=1000)
    draft_reply: str | None = Field(default=None, max_length=2000)


class TranslateIncomingAnalysis(_Base):
    explicit_ask: str | None = Field(default=None, max_length=1000)
    likely_subtext: list[SubtextHypothesis] = Field(max_length=5)
    ambiguity: AmbiguityReport
    recommended_next_action: NextAction
    eval_corpus_slice: str
    model_provenance: ModelProvenance


class TranslateIncomingEnvelope(_Base):
    deterministic_analysis: TranslateIncomingAnalysis
    prompt_for_llm_refinement: PromptForLLMRefinement
    eval_corpus_slice: str


# ---------------------------------------------------------------------------
# check_tone


class CheckToneInput(_Base):
    text: str = Field(min_length=1, max_length=8000)
    baseline_messages: list[str] | None = Field(default=None, max_length=20)
    target_register: TargetRegister | None = None
    channel: Channel | None = None


class ToneAxes(_Base):
    directness: float = Field(ge=0.0, le=100.0)
    warmth: float = Field(ge=0.0, le=100.0)
    urgency: float = Field(ge=0.0, le=100.0)


class BaselineDelta(_Base):
    directness: float = Field(ge=-100.0, le=100.0)
    warmth: float = Field(ge=-100.0, le=100.0)
    urgency: float = Field(ge=-100.0, le=100.0)


class FlaggedPhrase(_Base):
    start_char: int = Field(ge=0)
    end_char: int = Field(ge=0)
    phrase: str = Field(min_length=1, max_length=500)
    axis: ToneAxisName
    delta: float = Field(ge=-100.0, le=100.0)
    note: str | None = Field(default=None, max_length=500)


class CheckToneAnalysis(_Base):
    axes: ToneAxes
    axes_target: ToneAxes | None = None
    baseline_delta: BaselineDelta | None = None
    flagged_phrases: list[FlaggedPhrase] = Field(max_length=20)
    suggested_rewrite_hint: str | None = Field(default=None, max_length=1000)
    eval_corpus_slice: str
    model_provenance: ModelProvenance


class CheckToneEnvelope(_Base):
    deterministic_analysis: CheckToneAnalysis
    prompt_for_llm_refinement: PromptForLLMRefinement
    eval_corpus_slice: str


# ---------------------------------------------------------------------------
# rewrite_outgoing


class RewriteOutgoingInput(_Base):
    text: str = Field(min_length=1, max_length=8000)
    target_register: TargetRegister
    preserve_terms: list[str] | None = Field(default=None, max_length=100)
    channel: Channel | None = None
    preserve_intent: bool = True


class DiffSummary(_Base):
    tone_shift: str = Field(min_length=1, max_length=1000)
    structural_changes: list[str] = Field(max_length=20)
    warnings: list[str] = Field(max_length=20)


class RewriteOutgoingAnalysis(_Base):
    rewritten: str = Field(min_length=1, max_length=12000)
    preserved_terms: list[str]
    unpreserved_terms: list[str]
    diff_summary: DiffSummary
    eval_corpus_slice: str
    model_provenance: ModelProvenance


class RewriteOutgoingEnvelope(_Base):
    deterministic_analysis: RewriteOutgoingAnalysis
    prompt_for_llm_refinement: PromptForLLMRefinement
    eval_corpus_slice: str


# ---------------------------------------------------------------------------
# brief_meeting


class BriefMeetingInput(_Base):
    transcript: str = Field(min_length=20, max_length=200_000)
    me: str = Field(min_length=1, max_length=200)
    project: str | None = Field(default=None, min_length=1, max_length=200)
    speakers: list[str] | None = Field(default=None, max_length=30)


class QuotedSpan(_Base):
    start_char: int = Field(ge=0)
    end_char: int = Field(ge=0)
    text: str = Field(min_length=1)


class Ask(_Base):
    text: str = Field(min_length=1, max_length=1000)
    asker: str | None = Field(default=None, max_length=200)
    due: str | None = Field(default=None, max_length=200)
    quoted_span: QuotedSpan


class Decision(_Base):
    text: str = Field(min_length=1, max_length=1000)
    decided_by: list[str] = Field(max_length=20)
    quoted_span: QuotedSpan


class AmbiguousItem(_Base):
    text: str = Field(min_length=1, max_length=1000)
    verbatim: Literal[True] = True
    quoted_span: QuotedSpan
    reason: AmbiguousReason


class BriefMeetingAnalysis(_Base):
    my_asks: list[Ask] = Field(max_length=50)
    others_asks: list[Ask] = Field(max_length=50)
    decisions: list[Decision] = Field(max_length=50)
    ambiguous_items: list[AmbiguousItem] = Field(max_length=50)
    eval_corpus_slice: str
    model_provenance: ModelProvenance


class BriefMeetingEnvelope(_Base):
    deterministic_analysis: BriefMeetingAnalysis
    prompt_for_llm_refinement: PromptForLLMRefinement
    eval_corpus_slice: str
