# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the BYOS per-user backing resolver (ADR 0010 Phase D).

The graph-store round-trip exercises a real local ``file:`` libSQL database via
the cognitive-graph ``LibSqlStorage``. Those tests skip cleanly when either the
cognitive-graph package or the optional ``libsql`` client is not installed, so
this package's contract tests always run while the integration coverage layers
on in the hosted/container environment that has both.
"""

from __future__ import annotations

import importlib.util

import pytest
from neurodock_state.byos_connection_store import InMemoryByosConnectionStore
from neurodock_state.byos_resolver import ByosResolver
from neurodock_state.identity import UserKey
from neurodock_state.registry import StateBackingResolver

_HAS_LIBSQL_STACK = (
    importlib.util.find_spec("libsql") is not None
    and importlib.util.find_spec("neurodock_mcp_cognitive_graph") is not None
)

_needs_libsql = pytest.mark.skipif(
    not _HAS_LIBSQL_STACK,
    reason="requires the cognitive-graph package and the optional libsql client",
)


def test_resolver_satisfies_protocol() -> None:
    # Arrange / Act
    resolver = ByosResolver(InMemoryByosConnectionStore())

    # Assert
    assert isinstance(resolver, StateBackingResolver)


def test_storage_mode_is_none_when_not_connected() -> None:
    # Arrange
    resolver = ByosResolver(InMemoryByosConnectionStore())

    # Act / Assert — the security default: no connection => no storage.
    assert resolver.storage_mode(UserKey(sub="alice")) == "none"


def test_storage_mode_is_byos_once_connected() -> None:
    # Arrange
    connections = InMemoryByosConnectionStore()
    alice = UserKey(sub="alice")
    connections.put(alice, "file:/tmp/alice.db")
    resolver = ByosResolver(connections)

    # Act / Assert
    assert resolver.storage_mode(alice) == "byos"


def test_storage_mode_is_per_user() -> None:
    # Arrange
    connections = InMemoryByosConnectionStore()
    alice = UserKey(sub="alice")
    connections.put(alice, "file:/tmp/alice.db")
    resolver = ByosResolver(connections)

    # Act / Assert — Bob never opted in, so he stays on "none".
    assert resolver.storage_mode(alice) == "byos"
    assert resolver.storage_mode(UserKey(sub="bob")) == "none"


def test_graph_store_raises_when_not_connected() -> None:
    # Arrange
    resolver = ByosResolver(InMemoryByosConnectionStore())

    # Act / Assert — graph_store guards its own invariant.
    with pytest.raises(LookupError):
        resolver.graph_store(UserKey(sub="alice"))


def test_session_store_is_deferred() -> None:
    # Arrange
    resolver = ByosResolver(InMemoryByosConnectionStore())

    # Act / Assert — out of scope for Phase D.
    with pytest.raises(NotImplementedError):
        resolver.session_store(UserKey(sub="alice"))


def test_profile_store_is_deferred() -> None:
    # Arrange
    resolver = ByosResolver(InMemoryByosConnectionStore())

    # Act / Assert — out of scope for Phase D.
    with pytest.raises(NotImplementedError):
        resolver.profile_store(UserKey(sub="alice"))


@_needs_libsql
def test_graph_store_round_trips_against_a_local_libsql_db(tmp_path) -> None:  # type: ignore[no-untyped-def]
    # Arrange — a per-user local libSQL file stands in for the user's own DB.
    from datetime import UTC, datetime

    from neurodock_mcp_cognitive_graph.clock import FixedClock
    from neurodock_mcp_cognitive_graph.tools import recall_entity as recall_entity_tool
    from neurodock_mcp_cognitive_graph.tools import record_fact as record_fact_tool

    connections = InMemoryByosConnectionStore()
    alice = UserKey(sub="alice")
    db_path = tmp_path / "alice.db"
    connections.put(alice, f"file:{db_path}")
    resolver = ByosResolver(connections)
    clock = FixedClock(datetime(2026, 5, 31, 12, 0, tzinfo=UTC))

    # Act — write a fact through Alice's resolved store, then read it back.
    store = resolver.graph_store(alice)
    store.initialise()
    try:
        record_fact_tool(
            store,
            clock,
            subject={"type": "person", "name": "Dana"},
            predicate="tagged",
            object={"literal": "engineer"},
        )
        result = recall_entity_tool(store, "Dana")
    finally:
        store.close()

    # Assert — the fact persisted to the user's own database.
    assert result.entity is not None
    assert result.entity.name == "Dana"


@_needs_libsql
def test_two_users_get_isolated_databases(tmp_path) -> None:  # type: ignore[no-untyped-def]
    # Arrange — two users, two distinct local libSQL files.
    from datetime import UTC, datetime

    from neurodock_mcp_cognitive_graph.clock import FixedClock
    from neurodock_mcp_cognitive_graph.tools import recall_entity as recall_entity_tool
    from neurodock_mcp_cognitive_graph.tools import record_fact as record_fact_tool

    connections = InMemoryByosConnectionStore()
    alice = UserKey(sub="alice")
    bob = UserKey(sub="bob")
    connections.put(alice, f"file:{tmp_path / 'alice.db'}")
    connections.put(bob, f"file:{tmp_path / 'bob.db'}")
    resolver = ByosResolver(connections)
    clock = FixedClock(datetime(2026, 5, 31, 12, 0, tzinfo=UTC))

    # Act — Alice records a fact; Bob's database stays empty.
    alice_store = resolver.graph_store(alice)
    alice_store.initialise()
    bob_store = resolver.graph_store(bob)
    bob_store.initialise()
    try:
        record_fact_tool(
            alice_store,
            clock,
            subject={"type": "person", "name": "Dana"},
            predicate="tagged",
            object={"literal": "engineer"},
        )
        bob_result = recall_entity_tool(bob_store, "Dana")
    finally:
        alice_store.close()
        bob_store.close()

    # Assert — cross-tenant isolation: Bob cannot see Alice's entity.
    assert bob_result.entity is None
