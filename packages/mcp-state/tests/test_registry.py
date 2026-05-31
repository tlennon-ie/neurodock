# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the in-memory per-user backing resolver."""

from __future__ import annotations

from datetime import UTC, datetime

from neurodock_state.identity import UserKey
from neurodock_state.registry import (
    GraphStore,
    MemoryBackingResolver,
    StateBackingResolver,
)
from neurodock_state.session_store import SessionStore

NOW = datetime(2026, 5, 31, 12, 0, tzinfo=UTC)


def test_resolver_satisfies_protocol() -> None:
    # Arrange / Act
    resolver = MemoryBackingResolver()

    # Assert — structural conformance to the published contract.
    assert isinstance(resolver, StateBackingResolver)


def test_distinct_users_get_distinct_isolated_graph_stores() -> None:
    # Arrange
    resolver = MemoryBackingResolver()
    alice = UserKey(sub="alice")
    bob = UserKey(sub="bob")

    # Act
    alice_graph = resolver.graph_store(alice)
    bob_graph = resolver.graph_store(bob)

    # Assert — two distinct users, two distinct backing instances.
    assert alice_graph is not bob_graph
    assert isinstance(alice_graph, GraphStore)
    assert isinstance(bob_graph, GraphStore)


def test_distinct_users_get_isolated_session_state() -> None:
    # Arrange
    resolver = MemoryBackingResolver()
    alice = UserKey(sub="alice")
    bob = UserKey(sub="bob")

    # Act: open a session for Alice only.
    alice_sessions: SessionStore = resolver.session_store(alice)
    alice_sessions.open_session(alice, "sess-1", "ship phase b", now=NOW)

    # Assert: Bob's store knows nothing of Alice's session.
    bob_sessions = resolver.session_store(bob)
    assert bob_sessions.current_session(bob) is None
    assert alice_sessions.current_session(alice) is not None
    assert alice_sessions is not bob_sessions


def test_distinct_users_get_isolated_profile_state() -> None:
    # Arrange
    resolver = MemoryBackingResolver()
    alice = UserKey(sub="alice")
    bob = UserKey(sub="bob")

    # Act
    resolver.profile_store(alice).put_profile(alice, {"theme": "calm"})

    # Assert
    assert resolver.profile_store(alice).get_profile(alice) == {"theme": "calm"}
    assert resolver.profile_store(bob).get_profile(bob) is None


def test_same_user_gets_the_same_cached_backing() -> None:
    # Arrange
    resolver = MemoryBackingResolver()
    alice = UserKey(sub="alice")

    # Act / Assert — repeated calls return the same instances (state persists).
    assert resolver.graph_store(alice) is resolver.graph_store(alice)
    assert resolver.session_store(alice) is resolver.session_store(alice)
    assert resolver.profile_store(alice) is resolver.profile_store(alice)


def test_two_userkeys_with_same_sub_share_a_backing() -> None:
    # Arrange — equal subjects must collapse to one tenant.
    resolver = MemoryBackingResolver()

    # Act / Assert
    assert resolver.graph_store(UserKey(sub="alice")) is resolver.graph_store(UserKey(sub="alice"))


def test_memory_resolver_reports_hosted_mode() -> None:
    # Arrange / Act / Assert
    resolver = MemoryBackingResolver()
    assert resolver.storage_mode(UserKey(sub="alice")) == "hosted"
