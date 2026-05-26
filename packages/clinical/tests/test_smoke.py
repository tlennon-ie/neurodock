# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Smoke test — gives CI something concrete to run in Phase 0."""

from neurodock_clinical import __version__


def test_version_is_phase_zero_stub() -> None:
    """The package exposes a Phase 0 stub version."""
    assert __version__ == "0.0.0"
