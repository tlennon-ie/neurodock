# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
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


def test_base_module_imports_cleanly_at_runtime() -> None:
    """Regression guard for CodeQL alert #11 (unreachable ``if False:`` block).

    The forward-reference block in ``sources/base.py`` was changed from
    ``if False:`` (flagged as unconditionally unreachable) to
    ``if TYPE_CHECKING:``.  Both are False at runtime, so the module must
    still import cleanly without triggering any circular-import errors, and
    the factory must return the expected default without touching the
    type-checker-only imports.
    """
    import importlib

    # Force a fresh import cycle to make sure the TYPE_CHECKING guard
    # does not accidentally execute at module load time.
    import neurodock_mcp_task_fractionator.sources.base as base_mod

    importlib.reload(base_mod)
    source = base_mod.load_pending_task_source(env={})
    # The memory source is the safe default — graph is a stub.
    from neurodock_mcp_task_fractionator.sources.memory import InMemoryPendingTaskSource

    assert isinstance(source, InMemoryPendingTaskSource)
