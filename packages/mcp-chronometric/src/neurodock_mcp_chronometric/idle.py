# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""OS idle probe — consent-gated.

The consent gate is the only place in this server where we touch the OS. The
implementation in v0.0.1 deliberately returns ``None`` from the probe on every
platform: it is better to ship the gate verifiably working than to ship a
flaky cross-platform reader. A real probe lands in a later patch with explicit
platform support and tests on each.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

_LOG = logging.getLogger("neurodock_mcp_chronometric.idle")


@dataclass(frozen=True)
class IdleProbeResult:
    """Result of a single attempt to read the OS idle counter."""

    os_idle_seconds: int | None
    """Seconds since last OS-level input, or ``None`` when no reliable probe is
    available on this platform."""


def probe_os_idle() -> IdleProbeResult:
    """Sample the OS idle counter.

    v0.0.1 returns ``None`` on every platform. The structured log lets the
    operator confirm the consented path was reached.
    """

    _LOG.debug(
        "os_idle_probe_invoked",
        extra={"event": "os_idle_probe_invoked", "result": "unavailable"},
    )
    return IdleProbeResult(os_idle_seconds=None)


def log_consent_missing() -> None:
    """Emit the structured "consent missing" log line.

    Per ADR 0001 open question 2 the omission must be auditable.
    """

    _LOG.info(
        "idle_consent_missing",
        extra={
            "event": "idle_consent_missing",
            "tool": "idle_status",
            "action": "returned_unknown",
        },
    )
