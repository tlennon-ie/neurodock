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
