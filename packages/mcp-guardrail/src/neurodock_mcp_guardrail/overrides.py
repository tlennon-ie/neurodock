"""Override-token vocabulary for the three guardrail tools."""

from __future__ import annotations

from neurodock_mcp_guardrail.types import (
    HyperfocusOverrideOption,
    HyperfocusOverrideToken,
    OverrideOption,
    RuminationOverrideToken,
    SycophancyOverrideOption,
    SycophancyOverrideToken,
)

RUMINATION_OVERRIDE_DESCRIPTIONS: dict[RuminationOverrideToken, str] = {
    "fresh-context": (
        "You have new information that changes the question; the detector will skip and "
        "the new context will be recorded."
    ),
    "override-once": "Run this prompt anyway, just this once. Nothing is logged.",
    "disable-for-session": "Stop the rumination check until you end this session.",
    "lower-sensitivity": "Re-run the check with a stricter similarity threshold (0.75).",
}

RUMINATION_DEFAULT_OVERRIDES: tuple[RuminationOverrideToken, ...] = (
    "fresh-context",
    "override-once",
    "disable-for-session",
    "lower-sensitivity",
)


def rumination_default_override_options() -> list[OverrideOption]:
    return [
        OverrideOption(token=token, description=RUMINATION_OVERRIDE_DESCRIPTIONS[token])
        for token in RUMINATION_DEFAULT_OVERRIDES
    ]


HYPERFOCUS_OVERRIDE_DESCRIPTIONS: dict[HyperfocusOverrideToken, str] = {
    "snooze-15m": "Give me 15 more minutes then come back stronger.",
    "snooze-once": "Acknowledge this once and do not re-surface for this session.",
    "commit-and-close": "Close out and stop here.",
    "override-once": "Run this prompt anyway, just this once. Nothing is logged.",
    "disable-for-session": "Stop the hyperfocus check until you end this session.",
    "extend-end-of-day": (
        "Move my end-of-day to a new time; logged locally so the next nudge knows."
    ),
}

HYPERFOCUS_GENTLE_OVERRIDES: tuple[HyperfocusOverrideToken, ...] = (
    "disable-for-session",
)

HYPERFOCUS_NUDGE_HARD_OVERRIDES: tuple[HyperfocusOverrideToken, ...] = (
    "snooze-15m",
    "commit-and-close",
    "extend-end-of-day",
    "disable-for-session",
)


def hyperfocus_override_options(
    tokens: tuple[HyperfocusOverrideToken, ...],
) -> list[HyperfocusOverrideOption]:
    return [
        HyperfocusOverrideOption(token=token, description=HYPERFOCUS_OVERRIDE_DESCRIPTIONS[token])
        for token in tokens
    ]


SYCOPHANCY_OVERRIDE_DESCRIPTIONS: dict[SycophancyOverrideToken, str] = {
    "fresh-context": "You have new information that changes the question.",
    "override-once": "Run this prompt anyway, just this once. Nothing is logged.",
    "disable-for-session": "Stop the sycophancy check until you end this session.",
    "i-want-validation": (
        "Acknowledge you want validation anyway; the skill will proceed normally."
    ),
    "explain-the-match": "Show me which prior messages were counted.",
}

SYCOPHANCY_DETECTION_OVERRIDES: tuple[SycophancyOverrideToken, ...] = (
    "i-want-validation",
    "override-once",
    "fresh-context",
    "disable-for-session",
    "explain-the-match",
)


def sycophancy_default_override_options() -> list[SycophancyOverrideOption]:
    return [
        SycophancyOverrideOption(token=token, description=SYCOPHANCY_OVERRIDE_DESCRIPTIONS[token])
        for token in SYCOPHANCY_DETECTION_OVERRIDES
    ]
