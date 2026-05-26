# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""``idle_status`` implementation.

The consent gate is the only place we read from ``profile.privacy.os_idle_consent``.
When consent is absent, the tool returns a fully-formed successful result with
``consent_granted=False`` and emits a structured log line (see :mod:`idle`).
"""

from __future__ import annotations

from neurodock_mcp_chronometric.clock import Clock
from neurodock_mcp_chronometric.idle import log_consent_missing, probe_os_idle
from neurodock_mcp_chronometric.profile import ChronometricProfile, load_profile
from neurodock_mcp_chronometric.schemas import HyperfocusSignal, IdleStatusOutput


def idle_status(
    *,
    clock: Clock,
    profile: ChronometricProfile | None = None,
) -> IdleStatusOutput:
    """Return the consented OS idle reading, or a documented "no-consent" result.

    ``profile`` may be injected in tests to avoid filesystem reads. When not
    provided, the profile is loaded fresh via :func:`load_profile`.
    """

    effective_profile = profile if profile is not None else load_profile()

    if not effective_profile.os_idle_consent:
        log_consent_missing()
        return IdleStatusOutput(
            os_idle_seconds=None,
            hyperfocus_signal="unknown",
            consent_granted=False,
        )

    sampled_at = clock.now()
    probe = probe_os_idle()

    if probe.os_idle_seconds is None:
        # Probe unavailable on this platform — schema permits null with
        # consent_granted=True.
        return IdleStatusOutput(
            os_idle_seconds=None,
            hyperfocus_signal="unknown",
            consent_granted=True,
            sampled_at=sampled_at.isoformat(),
        )

    signal: HyperfocusSignal = "active" if probe.os_idle_seconds < 30 else "switched_away"
    return IdleStatusOutput(
        os_idle_seconds=probe.os_idle_seconds,
        hyperfocus_signal=signal,
        consent_granted=True,
        sampled_at=sampled_at.isoformat(),
    )
