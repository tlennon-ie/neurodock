"""Closed phrase lists for the hyperfocus and sycophancy heuristics.

Per ADR 0006 and ETHICS.md commitment 3, any change requires
clinical-reviewer sign-off.
"""

from __future__ import annotations

UNCONDITIONAL_AGREEMENT_OPENERS: tuple[str, ...] = (
    "yes,",
    "absolutely",
    "exactly right",
    "you're absolutely correct",
    "great point",
)

AGREEMENT_QUALIFIERS: tuple[str, ...] = ("but", "however", "unless")

REASSURANCE_TRIGGERS: tuple[str, ...] = (
    "is this ok",
    "is this okay",
    "am i doing this right",
    "should i really",
    "am i sure",
    "should we really",
)

REASSURANCE_THRESHOLD_COUNT = 3

ABSOLUTE_PRAISE_OPENERS: tuple[str, ...] = ("brilliant", "perfect", "excellent")

CITATION_MARKERS: tuple[str, ...] = (
    "because",
    "since",
    "the data shows",
    "according to",
)

UNSOLICITED_COMPLIMENT_ENDINGS: tuple[str, ...] = (
    "great question",
    "great point",
    "you're amazing",
    "you're brilliant",
    "fantastic work",
    "amazing work",
    "you're crushing it",
    "keep it up",
)

ESCALATING_VALIDATION_MAX_WORDS = 100
AGREEMENT_QUALIFIER_PREFIX_CHARS = 50
