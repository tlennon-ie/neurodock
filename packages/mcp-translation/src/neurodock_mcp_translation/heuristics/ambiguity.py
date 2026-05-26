# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Ambiguity detection for incoming messages.

Each pattern carries a reason code (matching the v0.1.0 schema enum) and an
explanatory note that the deterministic baseline can surface to the caller.
The LLM-refinement prompt can override or extend these spans.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from neurodock_mcp_translation.types import AmbiguityReason


@dataclass(frozen=True)
class _AmbiguityRule:
    pattern: re.Pattern[str]
    reason: AmbiguityReason
    note: str


@dataclass(frozen=True)
class AmbiguityHit:
    start_char: int
    end_char: int
    reason: AmbiguityReason
    note: str


_RULES: tuple[_AmbiguityRule, ...] = (
    _AmbiguityRule(
        pattern=re.compile(r"\bcan\s+we\s+revisit\b", re.IGNORECASE),
        reason="soft_request",
        note="'can we revisit' frequently implies 'I want to change' rather than a neutral re-open.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\bcircle\s+back\b", re.IGNORECASE),
        reason="hedged_commitment",
        note="'circle back' is a soft-deadline phrase that rarely self-fulfils without a reminder.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\bi'?ll\s+(?:loop|circle)\s+(?:back|in)\b", re.IGNORECASE),
        reason="hedged_commitment",
        note="'I'll loop back' is a deferral; assume no commitment to a specific day.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\bnext\s+(?:week|sprint|month)\b", re.IGNORECASE),
        reason="vague_timeline",
        note="Soft timeline without a committed day.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\bsoon\b", re.IGNORECASE),
        reason="vague_timeline",
        note="'soon' is unbounded and routinely slips.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\beveryone\b", re.IGNORECASE),
        reason="vague_referent",
        note="'everyone' is unspecified — which stakeholders are meant?",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\b(?:let\s+me\s+know\s+your\s+thoughts|thoughts\?)\b", re.IGNORECASE),
        reason="soft_request",
        note="Open-ended ask without a concrete response shape.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\bno\s+rush\b", re.IGNORECASE),
        reason="implied_urgency",
        note="'no rush' often coincides with an ask that has been outstanding — read as polite urgency.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\bhave\s+you\s+had\s+a\s+chance\b", re.IGNORECASE),
        reason="implied_urgency",
        note="Follow-up framing that implies the sender is waiting on the recipient.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\bnot\s+sure\s+everyone\s+is\s+aligned\b", re.IGNORECASE),
        reason="implied_blame",
        note="Softly attributes misalignment without naming who; often surfaces disagreement.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\bI'?m\s+not\s+sure\b", re.IGNORECASE),
        reason="hedged_commitment",
        note="Hedge phrase; the sender may have a stronger position than they are stating.",
    ),
    _AmbiguityRule(
        pattern=re.compile(r"\bquick\s+(?:one|question)\b", re.IGNORECASE),
        reason="soft_request",
        note="'quick' framing tends to under-state the work involved.",
    ),
)


def find_ambiguities(text: str) -> list[AmbiguityHit]:
    """Run all rules against ``text`` and return non-overlapping hits.

    When two rules match overlapping spans, the first rule wins (rules are
    ordered roughly by specificity, with the most specific phrases first).
    """

    hits: list[AmbiguityHit] = []
    covered: list[tuple[int, int]] = []
    for rule in _RULES:
        for match in rule.pattern.finditer(text):
            start, end = match.start(), match.end()
            if any(not (end <= a or start >= b) for a, b in covered):
                continue
            hits.append(
                AmbiguityHit(
                    start_char=start,
                    end_char=end,
                    reason=rule.reason,
                    note=rule.note,
                )
            )
            covered.append((start, end))
    # Sort hits by appearance so output is deterministic and stable.
    hits.sort(key=lambda hit: hit.start_char)
    return hits
