"""Unit tests for the pluggable PendingTaskSource layer."""

from __future__ import annotations

import pytest
from neurodock_mcp_task_fractionator.sources import (
    CognitiveGraphPendingTaskSource,
    CognitiveGraphUnavailableError,
    InMemoryPendingTaskSource,
    PendingTaskSource,
    load_pending_task_source,
)
from neurodock_mcp_task_fractionator.sources.base import TASK_SOURCE_ENV_VAR


def test_in_memory_source_round_trips() -> None:
    source = InMemoryPendingTaskSource()
    assert source.list_pending("p") == []


def test_factory_default_is_in_memory() -> None:
    """Without the env var set, the default mode is ``memory``."""

    source = load_pending_task_source(env={})
    assert isinstance(source, InMemoryPendingTaskSource)


def test_factory_picks_graph_when_env_says_graph() -> None:
    source = load_pending_task_source(env={TASK_SOURCE_ENV_VAR: "graph"})
    assert isinstance(source, CognitiveGraphPendingTaskSource)


def test_factory_falls_back_to_memory_on_unknown_value() -> None:
    """Unknown values revert to the safe default rather than crashing."""

    source = load_pending_task_source(env={TASK_SOURCE_ENV_VAR: "not-a-mode"})
    assert isinstance(source, InMemoryPendingTaskSource)


def test_graph_stub_always_raises_unavailable() -> None:
    """v0.0.1 stub raises COGNITIVE_GRAPH_UNAVAILABLE on every read."""

    source = CognitiveGraphPendingTaskSource()
    with pytest.raises(CognitiveGraphUnavailableError):
        source.list_pending("anything")


def test_both_classes_satisfy_protocol() -> None:
    """Structural check that both sources match :class:`PendingTaskSource`."""

    assert isinstance(InMemoryPendingTaskSource(), PendingTaskSource)
    assert isinstance(CognitiveGraphPendingTaskSource(), PendingTaskSource)
