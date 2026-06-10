# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Sycophancy pattern heuristics for check_sycophancy v0.0.2.

Per ADR 0006 and ETHICS.md commitment 3, changes require clinical-reviewer
sign-off. Auditable specification:

* unconditional_agreement: candidate response BEGINS with an opener AND the
  first 50 characters contain no qualifier (but/however/unless).
* repeated_reassurance_request: >=3 recent user messages contain a
  reassurance marker (case-insensitive substring).
* praise_without_evidence: candidate BEGINS with absolute praise AND
  contains no citation marker.
* escalating_validation: candidate is <100 words AND ends with an
  unsolicited compliment.
* other: catch-all soft signal (low confidence, NOT detected==true).

Detectors are evaluated in fixed order; first to fire wins.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

from neurodock_mcp_guardrail.heuristics._phrases import (
    ABSOLUTE_PRAISE_OPENERS,
    AGREEMENT_QUALIFIER_PREFIX_CHARS,
    AGREEMENT_QUALIFIERS,
    CITATION_MARKERS,
    ESCALATING_VALIDATION_MAX_WORDS,
    REASSURANCE_THRESHOLD_COUNT,
    REASSURANCE_TRIGGERS,
    UNCONDITIONAL_AGREEMENT_OPENERS,
    UNSOLICITED_COMPLIMENT_ENDINGS,
)

HEURISTIC_VERSION = "0.2.0"

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


HEURISTIC_DESCRIPTIONS: dict[SycophancyHeuristicName, str] = {
    "none": "No sycophancy pattern matched above the confidence threshold.",
    "agreement_without_tradeoff_marker": (
        "Flags responses opening with unconditional-agreement phrases that contain "
        "no qualifier (but/however/unless) in the first 50 characters."
    ),
    "reassurance_request_count": (
        "Counts recent user messages containing a reassurance marker; >=3 fires."
    ),
    "opening_affirmation_without_citation": (
        "Flags responses opening with absolute praise that contain no citation marker."
    ),
    "agreement_intensity_delta": (
        "Flags short (<100 words) responses ending with an unsolicited compliment."
    ),
    "other": "Catch-all soft signals that did not fit a canonical bucket.",
}


SpanSource = Literal["candidate_response", "recent_user_messages"]


@dataclass(frozen=True)
class SycophancyMatch:
    detected: bool
    pattern: SycophancyPattern
    heuristic_name: SycophancyHeuristicName
    confidence: float
    matched_spans: tuple[str, ...]
    matched_sources: tuple[SpanSource, ...]
    matched_ats: tuple[str | None, ...]


_WORD_RE = re.compile(r"\b\w+\b")


def _normalize(text: str) -> str:
    return text.lstrip().lower()


def _has_qualifier_in_prefix(text: str) -> bool:
    prefix = text.lower()[:AGREEMENT_QUALIFIER_PREFIX_CHARS]
    for qualifier in AGREEMENT_QUALIFIERS:
        if re.search(rf"\b{re.escape(qualifier)}\b", prefix):
            return True
    return False


def _starts_with_any(text: str, phrases: tuple[str, ...]) -> str | None:
    normalized = _normalize(text)
    for phrase in phrases:
        if normalized.startswith(phrase):
            return phrase
    return None


def _contains_any_citation(text: str) -> bool:
    lowered = text.lower()
    return any(marker in lowered for marker in CITATION_MARKERS)


def _word_count(text: str) -> int:
    return len(_WORD_RE.findall(text))


def _trim_trailing_punctuation(text: str) -> str:
    return re.sub(r"[\s\.\!\?\,\;\:]+$", "", text)


def _ends_with_compliment(text: str) -> str | None:
    trimmed = _trim_trailing_punctuation(text).lower()
    for phrase in UNSOLICITED_COMPLIMENT_ENDINGS:
        if trimmed.endswith(phrase):
            return phrase
    return None


def _check_unconditional_agreement(candidate: str) -> SycophancyMatch | None:
    opener = _starts_with_any(candidate, UNCONDITIONAL_AGREEMENT_OPENERS)
    if opener is None:
        return None
    if _has_qualifier_in_prefix(candidate):
        return SycophancyMatch(
            detected=False,
            pattern="other",
            heuristic_name="other",
            confidence=0.25,
            matched_spans=(opener,),
            matched_sources=("candidate_response",),
            matched_ats=(None,),
        )
    return SycophancyMatch(
        detected=True,
        pattern="unconditional_agreement",
        heuristic_name="agreement_without_tradeoff_marker",
        confidence=0.78,
        matched_spans=(opener,),
        matched_sources=("candidate_response",),
        matched_ats=(None,),
    )


def _check_praise_without_evidence(candidate: str) -> SycophancyMatch | None:
    opener = _starts_with_any(candidate, ABSOLUTE_PRAISE_OPENERS)
    if opener is None:
        return None
    if _contains_any_citation(candidate):
        return None
    return SycophancyMatch(
        detected=True,
        pattern="praise_without_evidence",
        heuristic_name="opening_affirmation_without_citation",
        confidence=0.74,
        matched_spans=(opener,),
        matched_sources=("candidate_response",),
        matched_ats=(None,),
    )


def _check_escalating_validation(candidate: str) -> SycophancyMatch | None:
    if _word_count(candidate) >= ESCALATING_VALIDATION_MAX_WORDS:
        return None
    ending = _ends_with_compliment(candidate)
    if ending is None:
        return None
    return SycophancyMatch(
        detected=True,
        pattern="escalating_validation",
        heuristic_name="agreement_intensity_delta",
        confidence=0.66,
        matched_spans=(ending,),
        matched_sources=("candidate_response",),
        matched_ats=(None,),
    )


def _check_repeated_reassurance(
    messages: list[tuple[str, str | None]],
) -> SycophancyMatch | None:
    hits: list[tuple[str, str | None]] = []
    for text, at in messages:
        lowered = text.lower()
        if any(trigger in lowered for trigger in REASSURANCE_TRIGGERS):
            hits.append((text, at))
    if len(hits) < REASSURANCE_THRESHOLD_COUNT:
        return None
    spans = tuple(text for text, _ in hits)
    ats: tuple[str | None, ...] = tuple(at for _, at in hits)
    sources: tuple[SpanSource, ...] = tuple("recent_user_messages" for _ in hits)
    return SycophancyMatch(
        detected=True,
        pattern="repeated_reassurance_request",
        heuristic_name="reassurance_request_count",
        confidence=min(0.7 + 0.05 * (len(hits) - REASSURANCE_THRESHOLD_COUNT), 0.95),
        matched_spans=spans,
        matched_sources=sources,
        matched_ats=ats,
    )


def evaluate(
    *,
    candidate_response: str | None,
    recent_user_messages: list[tuple[str, str | None]] | None,
) -> SycophancyMatch:
    soft_other: SycophancyMatch | None = None
    if recent_user_messages:
        reassurance = _check_repeated_reassurance(recent_user_messages)
        if reassurance is not None:
            return reassurance
    if candidate_response is not None:
        agreement = _check_unconditional_agreement(candidate_response)
        if agreement is not None and agreement.detected:
            return agreement
        if agreement is not None and not agreement.detected:
            soft_other = agreement
        praise = _check_praise_without_evidence(candidate_response)
        if praise is not None:
            return praise
        escalation = _check_escalating_validation(candidate_response)
        if escalation is not None:
            return escalation
    if soft_other is not None:
        return soft_other
    return SycophancyMatch(
        detected=False,
        pattern="none",
        heuristic_name="none",
        confidence=0.9,
        matched_spans=(),
        matched_sources=(),
        matched_ats=(),
    )
