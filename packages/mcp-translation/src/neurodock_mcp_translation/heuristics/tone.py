# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tone scoring heuristics.

Word-list-based scoring for the three axes the v0.1.0 schema specifies:

- ``directness``: how unhedged the message is (hedges pull down, bare
  imperatives push up).
- ``warmth``: how relational vs transactional the message reads.
- ``urgency``: how much time pressure is signalled.

The scorer is intentionally simple — a baseline a 7B local model can already
beat. Its purpose is to anchor the LLM-refinement prompt and to be useful when
no LLM is available at all.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Word lists


_DIRECT_TOKENS = (
    "must",
    "will not",
    "won't",
    "do not",
    "don't",
    "fix",
    "broken",
    "stop",
    "nack",
    "no.",
    "this is wrong",
    "wrong",
    "merge",
    "block",
    "blocker",
    "ship",
    "now",
    "asap",
)
_HEDGE_TOKENS = (
    "maybe",
    "perhaps",
    "i think",
    "i'm not sure",
    "kind of",
    "sort of",
    "any chance",
    "if it's okay",
    "if it's ok",
    "just",
    "wondering",
    "could we",
    "would it be possible",
)
_WARMTH_TOKENS = (
    "thanks",
    "thank you",
    "happy to",
    "appreciate",
    "great",
    "love this",
    "no worries",
    "hope you",
    "hey",
    "good catch",
    "heads up",
    "really useful",
    "helpful",
    "nice",
)
_COLD_TOKENS = (
    "strong nack",
    "nack",
    "this is broken",
    "fix this",
    "won't scale",
    "will not scale",
    "wrong",
    "do not",
    "don't",
    "rejected",
    "we need to",
)
_URGENCY_TOKENS = (
    "asap",
    "today",
    "eod",
    "by eod",
    "before eod",
    "now",
    "urgent",
    "right away",
    "immediately",
    "blocker",
    "blocking",
    "need this",
)
_LOW_URGENCY_TOKENS = (
    "no rush",
    "whenever",
    "when you have time",
    "no pressure",
    "next week",
    "next sprint",
)


# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ToneScore:
    directness: float
    warmth: float
    urgency: float


def _count_hits(text_lower: str, tokens: tuple[str, ...]) -> int:
    return sum(1 for token in tokens if token in text_lower)


def _clamp(value: float) -> float:
    return max(0.0, min(100.0, value))


def score_tone(text: str) -> ToneScore:
    """Return absolute tone scores for ``text`` on the three axes."""

    lower = text.lower()
    direct_hits = _count_hits(lower, _DIRECT_TOKENS)
    hedge_hits = _count_hits(lower, _HEDGE_TOKENS)
    warmth_hits = _count_hits(lower, _WARMTH_TOKENS)
    cold_hits = _count_hits(lower, _COLD_TOKENS)
    urgency_hits = _count_hits(lower, _URGENCY_TOKENS)
    low_urgency_hits = _count_hits(lower, _LOW_URGENCY_TOKENS)

    word_count = max(1, len(re.findall(r"\w+", text)))
    short_message_bonus = 5.0 if word_count <= 12 else 0.0

    directness = 50.0 + 12.0 * direct_hits - 12.0 * hedge_hits + short_message_bonus
    warmth = 50.0 + 12.0 * warmth_hits - 12.0 * cold_hits
    urgency = 50.0 + 14.0 * urgency_hits - 14.0 * low_urgency_hits

    return ToneScore(
        directness=_clamp(directness),
        warmth=_clamp(warmth),
        urgency=_clamp(urgency),
    )


def target_axes(register: str) -> ToneScore:
    """Return the canonical tone-axis targets for each target_register value."""

    return {
        "direct": ToneScore(directness=75, warmth=45, urgency=50),
        "warm": ToneScore(directness=45, warmth=80, urgency=40),
        "formal": ToneScore(directness=55, warmth=50, urgency=45),
        "concise": ToneScore(directness=70, warmth=40, urgency=55),
        "clarifying": ToneScore(directness=50, warmth=55, urgency=40),
    }.get(register, ToneScore(directness=50, warmth=50, urgency=50))


# ---------------------------------------------------------------------------
# Flagged-phrase detection


@dataclass(frozen=True)
class FlaggedPhraseHit:
    start_char: int
    end_char: int
    phrase: str
    axis: str  # "directness" | "warmth" | "urgency"
    delta: float
    note: str


_FLAGGED_RULES: tuple[tuple[re.Pattern[str], str, float, str], ...] = (
    (
        re.compile(r"\bstrong\s+nack\.?", re.IGNORECASE),
        "warmth",
        -55.0,
        "Opens with a blunt rejection token; substantially blunter than typical baseline.",
    ),
    (
        re.compile(r"\b(?:will\s+not|won't)\s+scale\b", re.IGNORECASE),
        "directness",
        40.0,
        "Strong unhedged assertion; readers may parse as a dismissal of the author's work.",
    ),
    (
        re.compile(r"\bthis\s+is\s+broken\b", re.IGNORECASE),
        "warmth",
        -40.0,
        "Bare diagnostic with no relational framing; reads cold.",
    ),
    (
        re.compile(r"\bfix\s+(?:this|it)\b", re.IGNORECASE),
        "directness",
        30.0,
        "Bare imperative.",
    ),
    (
        re.compile(r"\bbefore\s+EOD\b", re.IGNORECASE),
        "urgency",
        30.0,
        "Hard same-day deadline; high urgency signal.",
    ),
    (
        re.compile(r"\bASAP\b", re.IGNORECASE),
        "urgency",
        35.0,
        "Maximum urgency token.",
    ),
)


def find_flagged_phrases(text: str) -> list[FlaggedPhraseHit]:
    """Return phrase-level flags using the rule table."""

    hits: list[FlaggedPhraseHit] = []
    for pattern, axis, delta, note in _FLAGGED_RULES:
        for match in pattern.finditer(text):
            hits.append(
                FlaggedPhraseHit(
                    start_char=match.start(),
                    end_char=match.end(),
                    phrase=text[match.start() : match.end()],
                    axis=axis,
                    delta=delta,
                    note=note,
                )
            )
    # Order by absolute delta descending (severity), stable by appearance for ties.
    hits.sort(key=lambda hit: (-abs(hit.delta), hit.start_char))
    return hits
