# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Thin loader for ``~/.neurodock/profile.yaml``.

Only the fields the chronometric server needs are read in v0.0.1:

* ``privacy.os_idle_consent`` — gates the OS idle probe.
* ``chronometric.zones`` — optional override of the energy-zone bands
  (forward-compat hook; loader exposes it but server may ignore in v0.0.1).

A ``NEURODOCK_PROFILE_PATH`` environment variable overrides the default path,
which keeps tests fully isolated from the user's filesystem.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

_LOG = logging.getLogger("neurodock_mcp_chronometric.profile")

DEFAULT_PROFILE_PATH = Path.home() / ".neurodock" / "profile.yaml"
PROFILE_PATH_ENV_VAR = "NEURODOCK_PROFILE_PATH"


@dataclass(frozen=True)
class ChronometricProfile:
    """Subset of the user's profile relevant to the chronometric server."""

    os_idle_consent: bool
    raw_zones: dict[str, Any] | None
    """Reserved for v0.1.x profile-declared zone overrides — unused in v0.0.1."""


def profile_path() -> Path:
    override = os.environ.get(PROFILE_PATH_ENV_VAR)
    if override:
        return Path(override)
    return DEFAULT_PROFILE_PATH


def load_profile() -> ChronometricProfile:
    """Load the chronometric subset of the user profile.

    Returns a safe-default profile (consent=False, no zones) when the file is
    missing or unparseable. A structured warning is logged in the unparseable
    case so the omission is visible — never silent.
    """

    path = profile_path()
    if not path.exists():
        return ChronometricProfile(os_idle_consent=False, raw_zones=None)

    try:
        with path.open("r", encoding="utf-8") as fp:
            data = yaml.safe_load(fp) or {}
    except (OSError, yaml.YAMLError) as exc:
        _LOG.warning(
            "profile_unreadable",
            extra={"event": "profile_unreadable", "error_type": type(exc).__name__},
        )
        return ChronometricProfile(os_idle_consent=False, raw_zones=None)

    if not isinstance(data, dict):
        return ChronometricProfile(os_idle_consent=False, raw_zones=None)

    privacy = data.get("privacy")
    consent = False
    if isinstance(privacy, dict):
        consent_raw = privacy.get("os_idle_consent")
        if isinstance(consent_raw, bool):
            consent = consent_raw

    chronometric = data.get("chronometric")
    raw_zones: dict[str, Any] | None = None
    if isinstance(chronometric, dict):
        zones = chronometric.get("zones")
        if isinstance(zones, dict):
            raw_zones = zones

    return ChronometricProfile(os_idle_consent=consent, raw_zones=raw_zones)
