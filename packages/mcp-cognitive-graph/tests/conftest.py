"""Shared pytest fixtures for the cognitive-graph package."""

from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.storage.sqlite import SQLiteStorage

# A fixed reference instant used by the deterministic clock.
FIXED_NOW = datetime(2026, 5, 15, 9, 14, 22, tzinfo=UTC)


@pytest.fixture
def fixed_clock() -> FixedClock:
    """A deterministic clock anchored at 2026-05-15T09:14:22Z."""
    return FixedClock(FIXED_NOW)


@pytest.fixture
def memory_storage() -> InMemoryStorage:
    """A fresh in-memory storage backing for each test."""
    return InMemoryStorage()


@pytest.fixture
def sqlite_storage(tmp_path: Path) -> Iterator[SQLiteStorage]:
    """A fresh SQLite store anchored at a tmp-path file."""
    db_path = tmp_path / "test-cognitive-graph.sqlite"
    storage = SQLiteStorage(db_path)
    storage.initialise()
    try:
        yield storage
    finally:
        storage.close()


SCHEMAS_DIR = Path(__file__).resolve().parent.parent / "schemas"


@pytest.fixture(scope="session")
def schemas() -> dict[str, dict[str, object]]:
    """Load the four JSON Schemas keyed by tool name."""
    out: dict[str, dict[str, object]] = {}
    for name in (
        "recall_entity",
        "record_fact",
        "recall_decisions",
        "weekly_rollup",
    ):
        text = (SCHEMAS_DIR / f"{name}.schema.json").read_text(encoding="utf-8")
        out[name] = json.loads(text)
    return out
