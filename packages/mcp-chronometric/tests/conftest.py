# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Shared fixtures for chronometric tests.

Tests get a fresh, isolated state and a frozen clock per-test. No test ever
writes to the user's filesystem; the profile path is redirected into a
``tmp_path`` so consent state is fully controlled by the test.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import UTC, datetime, timezone
from pathlib import Path
from typing import Any

import pytest
from neurodock_mcp_chronometric.clock import FrozenClock
from neurodock_mcp_chronometric.profile import PROFILE_PATH_ENV_VAR
from neurodock_mcp_chronometric.state import SessionState


@pytest.fixture
def utc_offset() -> timezone:
    return UTC


@pytest.fixture
def frozen_clock(utc_offset: timezone) -> FrozenClock:
    """A clock frozen at 2026-05-15T09:00:00Z (a Friday morning)."""
    return FrozenClock(datetime(2026, 5, 15, 9, 0, 0, tzinfo=utc_offset))


@pytest.fixture
def session_state() -> SessionState:
    return SessionState()


@pytest.fixture
def isolated_profile_path(tmp_path: Path) -> Iterator[Path]:
    """Redirect the profile loader to a temp file via the env-var override."""

    profile_file = tmp_path / "profile.yaml"
    original = os.environ.get(PROFILE_PATH_ENV_VAR)
    os.environ[PROFILE_PATH_ENV_VAR] = str(profile_file)
    try:
        yield profile_file
    finally:
        if original is None:
            os.environ.pop(PROFILE_PATH_ENV_VAR, None)
        else:
            os.environ[PROFILE_PATH_ENV_VAR] = original


def write_profile(path: Path, data: dict[str, Any]) -> None:
    """Helper used by tests to drop a profile YAML at the redirected path."""
    import yaml

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data), encoding="utf-8")
