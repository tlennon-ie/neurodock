# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for ``idle_status``."""

from __future__ import annotations

import logging
from pathlib import Path

from neurodock_mcp_chronometric.clock import FrozenClock
from neurodock_mcp_chronometric.profile import (
    ChronometricProfile,
    load_profile,
)
from neurodock_mcp_chronometric.tools.idle import idle_status

from .conftest import write_profile


def test_no_consent_returns_unknown_shape(
    frozen_clock: FrozenClock, isolated_profile_path: Path
) -> None:
    """Happy path (no consent): explicit shape, no consent flag set."""

    # No profile file at all on disk.
    result = idle_status(clock=frozen_clock)
    assert result.consent_granted is False
    assert result.os_idle_seconds is None
    assert result.hyperfocus_signal == "unknown"


def test_consent_granted_shape(frozen_clock: FrozenClock) -> None:
    """Happy path (consent): consent_granted=True; sampled_at populated."""

    profile = ChronometricProfile(os_idle_consent=True, raw_zones=None)
    result = idle_status(clock=frozen_clock, profile=profile)

    assert result.consent_granted is True
    # v0.0.1 probe always returns None; signal is therefore unknown.
    assert result.os_idle_seconds is None
    assert result.hyperfocus_signal == "unknown"
    assert result.sampled_at is not None


def test_consent_missing_log_line_emitted(
    frozen_clock: FrozenClock,
    isolated_profile_path: Path,
    caplog: logging.LogRecord,
) -> None:
    """Edge case: the structured log line MUST fire on consent-missing."""

    # No consent profile written.
    caplog_typed = caplog  # type: ignore[assignment]
    with caplog_typed.at_level(logging.INFO, logger="neurodock_mcp_chronometric.idle"):
        result = idle_status(clock=frozen_clock)

    assert result.consent_granted is False
    events = [record for record in caplog_typed.records if record.message == "idle_consent_missing"]
    assert events, "expected an idle_consent_missing log line"
    assert getattr(events[0], "event", None) == "idle_consent_missing"
    assert getattr(events[0], "tool", None) == "idle_status"


def test_profile_consent_true_round_trips(
    frozen_clock: FrozenClock, isolated_profile_path: Path
) -> None:
    """Edge case: writing consent: true to the YAML reloads with consent True."""

    write_profile(
        isolated_profile_path,
        {"privacy": {"os_idle_consent": True}},
    )
    profile = load_profile()
    assert profile.os_idle_consent is True

    result = idle_status(clock=frozen_clock, profile=profile)
    assert result.consent_granted is True
