# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Quote extraction for meeting-transcript heuristics.

Each function scans the transcript line-by-line, identifies candidate spans
that match an ask / decision / ambiguity pattern, and returns ``LineSpan``
records that the ``brief_meeting`` tool turns into ``Ask`` / ``Decision`` /
``AmbiguousItem`` schema objects.

Transcripts are expected to be in the ``Speaker: utterance`` form (one
utterance per line). When that form is not present, the heuristics still
produce reasonable spans by falling back to whole-line matches.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

# ---------------------------------------------------------------------------
# Line indexing


@dataclass(frozen=True)
class TranscriptLine:
    start_char: int
    end_char: int  # exclusive of trailing newline
    text: str
    speaker: str | None  # None when the line doesn't have a "Speaker: ..." prefix


_SPEAKER_RE = re.compile(r"^([A-Za-z][A-Za-z0-9 _\-]{0,80}?)\s*:\s*(.*)$")


def index_lines(transcript: str) -> list[TranscriptLine]:
    """Return the line index with character offsets."""

    lines: list[TranscriptLine] = []
    cursor = 0
    # Use splitlines(keepends=True) so cursor accounting is exact.
    for raw in transcript.splitlines(keepends=True):
        stripped = raw.rstrip("\r\n")
        if not stripped:
            cursor += len(raw)
            continue
        match = _SPEAKER_RE.match(stripped)
        speaker = match.group(1).strip() if match else None
        lines.append(
            TranscriptLine(
                start_char=cursor,
                end_char=cursor + len(stripped),
                text=stripped,
                speaker=speaker,
            )
        )
        cursor += len(raw)
    return lines


# ---------------------------------------------------------------------------
# Ask / decision / ambiguity detection


_ASK_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bcan\s+you\b", re.IGNORECASE),
    re.compile(r"\bcould\s+you\b", re.IGNORECASE),
    re.compile(r"\bwould\s+you\b", re.IGNORECASE),
    re.compile(r"\bi\s+need\b", re.IGNORECASE),
    re.compile(r"\bi\s+(?:would\s+)?like\b", re.IGNORECASE),
    re.compile(r"\bcan\s+someone\b", re.IGNORECASE),
    re.compile(r"\bplease\b", re.IGNORECASE),
    re.compile(r"\b(?:could|can)\s+(?:we|someone)\s+(?:own|draft|write|own|land)\b", re.IGNORECASE),
)

_DECISION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bwe\s+(?:decided|agreed|landed\s+on)\b", re.IGNORECASE),
    re.compile(r"\bdecision[:\s]", re.IGNORECASE),
    re.compile(r"\bi'?ll\s+(?:have|own|take)\b", re.IGNORECASE),
    re.compile(r"\byes\s+[—\-]\s+i'?ll\b", re.IGNORECASE),
    re.compile(r"\bsounds\s+good\b", re.IGNORECASE),
    re.compile(r"\bagreed\b", re.IGNORECASE),
    re.compile(r"\blet'?s\s+(?:land|do|go\s+with)\b", re.IGNORECASE),
)

_AMBIGUITY_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bnext\s+(?:week|sprint|month)\b", re.IGNORECASE), "vague_timeline"),
    (re.compile(r"\bsoon\b", re.IGNORECASE), "vague_timeline"),
    (re.compile(r"\bcircle\s+back\b", re.IGNORECASE), "deferred_topic"),
    (re.compile(r"\brevisit\b", re.IGNORECASE), "deferred_topic"),
    (re.compile(r"\boffline\b", re.IGNORECASE), "deferred_topic"),
    (re.compile(r"\bsomeone\b", re.IGNORECASE), "unassigned_owner"),
    (re.compile(r"\bwe\s+should\s+(?:also\s+)?think\b", re.IGNORECASE), "hedged_commitment"),
    (re.compile(r"\bi'?ll\s+(?:loop|circle)\s+(?:back|in)\b", re.IGNORECASE), "hedged_commitment"),
    (
        re.compile(r"\b(?:those|that|this)\s+(?:priorities|issues|things)\b", re.IGNORECASE),
        "vague_referent",
    ),
)


@dataclass(frozen=True)
class LineHit:
    line: TranscriptLine
    matched_label: (
        str  # for asks/decisions: the matched verb phrase; for ambiguity: the reason code
    )


def find_asks(lines: list[TranscriptLine]) -> list[LineHit]:
    """Return lines containing ask-like phrases."""

    hits: list[LineHit] = []
    for line in lines:
        for pattern in _ASK_PATTERNS:
            match = pattern.search(line.text)
            if match:
                hits.append(LineHit(line=line, matched_label=match.group(0).lower()))
                break
    return hits


def find_decisions(lines: list[TranscriptLine]) -> list[LineHit]:
    """Return lines containing decision-like phrases."""

    hits: list[LineHit] = []
    for line in lines:
        for pattern in _DECISION_PATTERNS:
            match = pattern.search(line.text)
            if match:
                hits.append(LineHit(line=line, matched_label=match.group(0).lower()))
                break
    return hits


def find_ambiguities(lines: list[TranscriptLine]) -> list[LineHit]:
    """Return lines containing ambiguity markers, labelled by reason code."""

    hits: list[LineHit] = []
    for line in lines:
        for pattern, reason in _AMBIGUITY_PATTERNS:
            if pattern.search(line.text):
                hits.append(LineHit(line=line, matched_label=reason))
                break
    return hits


def find_due_hint(text: str) -> str | None:
    """Extract a free-text due indicator (e.g. 'Wednesday', 'EOD') if present.

    Returns ``None`` when no timing language was found.
    """

    patterns = (
        re.compile(r"\bby\s+([A-Za-z]+day)\b", re.IGNORECASE),
        re.compile(r"\bby\s+(EOD|EOW|EOM)\b", re.IGNORECASE),
        re.compile(r"\bby\s+(end\s+of\s+(?:day|week|month))\b", re.IGNORECASE),
        re.compile(r"\b(?:before|until)\s+([A-Za-z]+day)\b", re.IGNORECASE),
        re.compile(r"\bby\s+([0-9]{4}-[0-9]{2}-[0-9]{2})\b", re.IGNORECASE),
        re.compile(r"\b(next\s+(?:week|sprint|month|[A-Za-z]+day))\b", re.IGNORECASE),
    )
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            return match.group(1)
    return None
