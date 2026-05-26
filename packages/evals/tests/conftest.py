# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Shared pytest fixtures for the eval harness suite."""

from __future__ import annotations

from pathlib import Path

import pytest
from neurodock_evals.corpus import package_root


@pytest.fixture(scope="session")
def evals_package_root() -> Path:
    return package_root()


@pytest.fixture(scope="session")
def corpora_root(evals_package_root: Path) -> Path:
    return evals_package_root / "corpora"
