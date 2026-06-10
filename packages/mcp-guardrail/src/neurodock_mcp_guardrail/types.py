# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Pydantic models mirroring the JSON Schemas."""

from __future__ import annotations

from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _InputItem(BaseModel):
    """Base for the caller-supplied nested objects (history items, the
    chronometric snapshot, recent messages).

    These receive raw dicts the calling model assembles, so they are lenient
    where the strict output contract is not: extra keys are ignored rather than
    rejected (the advertised MCP schema is an open object, so a caller cannot
    know which keys are forbidden), and fields accept their canonical name or a
    natural alias. The heuristics still read the canonical fields, unchanged.
    """

    model_config = ConfigDict(extra="ignore", populate_by_name=True)


# Aliases for the two recurring caller fields, so the natural shapes an LLM
# produces ({"prompt"/"message"/"content": ...}, {"timestamp"/"time": ...}) map
# onto the canonical `text`/`at` the heuristics consume.
_TEXT_ALIASES = AliasChoices("text", "message", "prompt", "content")
_AT_ALIASES = AliasChoices("at", "timestamp", "time", "ts")


HeuristicName = Literal["word_overlap_jaccard", "embedding_cosine", "topic_model"]

RuminationOverrideToken = Literal[
    "fresh-context",
    "override-once",
    "disable-for-session",
    "lower-sensitivity",
]

HyperfocusLevel = Literal["none", "gentle", "nudge", "hard"]

HyperfocusHeuristicName = Literal["elapsed_threshold_with_eod"]

HyperfocusOverrideToken = Literal[
    "snooze-15m",
    "snooze-once",
    "commit-and-close",
    "override-once",
    "disable-for-session",
    "extend-end-of-day",
]

HyperfocusSuggestedAction = Literal[
    "no_action",
    "stand_and_stretch",
    "hydrate",
    "walk_outside",
    "switch_context",
    "end_session",
    "quote_prior_intent_and_offer_close",
]

HyperfocusIdleSignal = Literal["active", "switched_away", "unknown"]

SycophancyPattern = Literal[
    "none",
    "unconditional_agreement",
    "repeated_reassurance_request",
    "praise_without_evidence",
    "escalating_validation",
    "other",
]

SycophancyHeuristicName = Literal[
    "none",
    "agreement_without_tradeoff_marker",
    "reassurance_request_count",
    "opening_affirmation_without_citation",
    "agreement_intensity_delta",
    "other",
]

SycophancyOverrideToken = Literal[
    "fresh-context",
    "override-once",
    "disable-for-session",
    "i-want-validation",
    "explain-the-match",
]

DEFAULT_FP_FEEDBACK_PATH: str = (
    "https://github.com/tlennon-ie/neurodock/issues/new?template=guardrail_false_positive.md"
)


class RuminationHistoryItem(_InputItem):
    text: str = Field(min_length=1, max_length=8000, validation_alias=_TEXT_ALIASES)
    at: str = Field(validation_alias=_AT_ALIASES)


class RuminationInput(_Base):
    current_prompt: str = Field(min_length=1, max_length=8000)
    history: list[RuminationHistoryItem]
    window_minutes: int = Field(default=90, ge=1, le=1440)
    threshold_count: int = Field(default=3, ge=2, le=50)
    similarity_threshold: float = Field(default=0.55, ge=0.0, le=1.0)


class RuminationSimilarPrompt(_Base):
    text: str
    at: str
    similarity: float = Field(ge=0.0, le=1.0)


class HeuristicDescriptor(_Base):
    name: HeuristicName
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    description: str = Field(max_length=500)


class OverrideOption(_Base):
    token: RuminationOverrideToken
    description: str = Field(max_length=200)


class RuminationOutput(_Base):
    detected: bool
    similar_prompts: list[RuminationSimilarPrompt] = Field(default_factory=list, max_length=50)
    count: int = Field(ge=0)
    window_seconds: int = Field(ge=60)
    threshold: int = Field(ge=2)
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = Field(max_length=280)
    heuristic: HeuristicDescriptor
    override_options: list[OverrideOption] = Field(default_factory=list, max_length=10)
    false_positive_feedback_path: str = DEFAULT_FP_FEEDBACK_PATH


class OpenSessionSnapshot(_InputItem):
    session_id: str
    started_at: str = Field(validation_alias=AliasChoices("started_at", "startedAt", "start"))
    intent: str = Field(min_length=1, max_length=500)
    elapsed_seconds: int = Field(
        ge=0, validation_alias=AliasChoices("elapsed_seconds", "elapsedSeconds")
    )


class ChronometricSnapshot(_InputItem):
    open_session: OpenSessionSnapshot | None = None
    now: str = Field(validation_alias=_AT_ALIASES)
    idle_signal: HyperfocusIdleSignal | None = None


class EscalationThresholds(_InputItem):
    gentle: int = Field(ge=5, le=480)
    nudge: int = Field(ge=5, le=480)
    hard: int = Field(ge=5, le=480)


class HyperfocusInput(_Base):
    chronometric_snapshot: ChronometricSnapshot
    session_id: str | None = None
    hyperfocus_break_minutes: int = Field(default=90, ge=15, le=480)
    end_of_day_local: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    escalation_thresholds: EscalationThresholds | None = None


class HyperfocusHeuristicDescriptor(_Base):
    name: HyperfocusHeuristicName
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    description: str = Field(max_length=500)


class HyperfocusOverrideOption(_Base):
    token: HyperfocusOverrideToken
    description: str = Field(max_length=200)


class HyperfocusOutput(_Base):
    level: HyperfocusLevel
    elapsed_seconds: int = Field(ge=0)
    prior_intent: str | None = Field(default=None, max_length=500)
    time_since_stated_end: str | None = Field(
        default=None,
        pattern=r"^P([0-9]+[YMWD])*(T([0-9]+H)?([0-9]+M)?([0-9]+(\.[0-9]+)?S)?)?$",
    )
    suggested_action: HyperfocusSuggestedAction | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    reason: str = Field(max_length=280)
    heuristic: HyperfocusHeuristicDescriptor
    override_options: list[HyperfocusOverrideOption] = Field(default_factory=list, max_length=10)
    false_positive_feedback_path: str = DEFAULT_FP_FEEDBACK_PATH


class SycophancyRecentMessage(_InputItem):
    text: str = Field(min_length=1, max_length=8000, validation_alias=_TEXT_ALIASES)
    # Sycophancy is not time-windowed (unlike rumination), so a timestamp is
    # optional here — a bare {"text": "..."} message is valid.
    at: str | None = Field(default=None, validation_alias=_AT_ALIASES)


class SycophancyInput(_Base):
    candidate_response: str | None = Field(default=None, min_length=1, max_length=16000)
    recent_user_messages: list[SycophancyRecentMessage] | None = None
    decision_context: str | None = Field(default=None, max_length=500)


SycophancySpanSource = Literal["candidate_response", "recent_user_messages"]


class SycophancyMatchedSpan(_Base):
    source: SycophancySpanSource
    text: str = Field(min_length=1, max_length=1000)
    at: str | None = None


class SycophancyHeuristicDescriptor(_Base):
    name: SycophancyHeuristicName
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    description: str = Field(max_length=500)


class SycophancyOverrideOption(_Base):
    token: SycophancyOverrideToken
    description: str = Field(max_length=200)


class SycophancyOutput(_Base):
    detected: bool
    pattern: SycophancyPattern
    confidence: float = Field(ge=0.0, le=1.0)
    matched_spans: list[SycophancyMatchedSpan] = Field(default_factory=list, max_length=20)
    counter_prompt: str | None = Field(default=None, max_length=1000)
    reason: str = Field(max_length=280)
    heuristic: SycophancyHeuristicDescriptor
    override_options: list[SycophancyOverrideOption] = Field(default_factory=list, max_length=10)
    false_positive_feedback_path: str = DEFAULT_FP_FEEDBACK_PATH
