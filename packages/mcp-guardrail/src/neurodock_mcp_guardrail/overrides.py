"""Override-token vocabulary for the three guardrail tools.

Per ADR 0006 §2 and ``ETHICS.md`` commitment 2, every fired detection MUST
carry at least one override option. The vocabulary is **closed** at v0.1.0:
new tokens require a minor bump and clinical-reviewer sign-off.

This module is the single source of truth for the human-readable description
of each token. Tool implementations import the dict and assemble their
``override_options`` arrays from it.
"""

from __future__ import annotations

from neurodock_mcp_guardrail.types import (
    HyperfocusOverrideToken,
    OverrideOption,
    RuminationOverrideToken,
    SycophancyOverrideToken,
)

# ---------------------------------------------------------------------------
# Rumination overrides

RUMINATION_OVERRIDE_DESCRIPTIONS: dict[RuminationOverrideToken, str] = {
    "fresh-context": (
        "You have new information that changes the question; the detector will skip and "
        "the new context will be recorded."
    ),
    "override-once": "Run this prompt anyway, just this once. Nothing is logged.",
    "disable-for-session": "Stop the rumination check until you end this session.",
    "lower-sensitivity": "Re-run the check with a stricter similarity threshold (0.75).",
}

# Default override set when rumination fires. ADR 0006 §2 + §9 require at
# minimum ``override-once`` and ``fresh-context``; the other two tokens are
# returned by default as well so the calling skill has the full closed set.
RUMINATION_DEFAULT_OVERRIDES: tuple[RuminationOverrideToken, ...] = (
    "fresh-context",
    "override-once",
    "disable-for-session",
    "lower-sensitivity",
)


def rumination_default_override_options() -> list[OverrideOption]:
    """Return the v0.1.0 default override option set for ``check_rumination``."""
    return [
        OverrideOption(token=token, description=RUMINATION_OVERRIDE_DESCRIPTIONS[token])
        for token in RUMINATION_DEFAULT_OVERRIDES
    ]


# ---------------------------------------------------------------------------
# Hyperfocus overrides (reference for the Phase 3 implementation; not used at
# runtime in v0.0.1 because the tool returns DETECTOR_NOT_YET_IMPLEMENTED).

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


# ---------------------------------------------------------------------------
# Sycophancy overrides (reference; runtime is Phase 3).

SYCOPHANCY_OVERRIDE_DESCRIPTIONS: dict[SycophancyOverrideToken, str] = {
    "fresh-context": "You have new information that changes the question.",
    "override-once": "Run this prompt anyway, just this once. Nothing is logged.",
    "disable-for-session": "Stop the sycophancy check until you end this session.",
    "i-want-validation": (
        "Acknowledge you want validation anyway; the skill will proceed normally."
    ),
    "explain-the-match": "Show me which prior messages were counted.",
}
