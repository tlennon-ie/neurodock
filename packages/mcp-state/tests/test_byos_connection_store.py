# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the in-memory BYOS connection store (ADR 0010 Phase D)."""

from __future__ import annotations

from neurodock_state.byos_connection_store import (
    ByosConnectionStore,
    Connection,
    InMemoryByosConnectionStore,
)
from neurodock_state.identity import UserKey


def test_in_memory_store_satisfies_protocol() -> None:
    # Arrange / Act
    store = InMemoryByosConnectionStore()

    # Assert — structural conformance to the published contract.
    assert isinstance(store, ByosConnectionStore)


def test_get_returns_none_when_not_connected() -> None:
    # Arrange
    store = InMemoryByosConnectionStore()

    # Act / Assert
    assert store.get(UserKey(sub="alice")) is None


def test_put_then_get_round_trips_the_connection() -> None:
    # Arrange
    store = InMemoryByosConnectionStore()
    alice = UserKey(sub="alice")

    # Act
    store.put(alice, "libsql://alice.turso.io", auth_token="secret-token")

    # Assert
    assert store.get(alice) == Connection(url="libsql://alice.turso.io", auth_token="secret-token")


def test_put_without_token_stores_none_token() -> None:
    # Arrange
    store = InMemoryByosConnectionStore()
    alice = UserKey(sub="alice")

    # Act
    store.put(alice, "file:/tmp/alice.db")

    # Assert
    connection = store.get(alice)
    assert connection is not None
    assert connection.auth_token is None


def test_distinct_users_are_isolated() -> None:
    # Arrange
    store = InMemoryByosConnectionStore()
    alice = UserKey(sub="alice")
    bob = UserKey(sub="bob")

    # Act
    store.put(alice, "libsql://alice.turso.io", auth_token="a")

    # Assert — Bob sees nothing of Alice's connection.
    assert store.get(bob) is None
    assert store.get(alice) is not None


def test_same_sub_collapses_to_one_tenant() -> None:
    # Arrange
    store = InMemoryByosConnectionStore()
    store.put(UserKey(sub="alice"), "libsql://alice.turso.io")

    # Act / Assert — equal subjects address the same stored connection.
    assert store.get(UserKey(sub="alice")) is not None


def test_delete_clears_the_connection() -> None:
    # Arrange
    store = InMemoryByosConnectionStore()
    alice = UserKey(sub="alice")
    store.put(alice, "libsql://alice.turso.io", auth_token="a")

    # Act
    store.delete(alice)

    # Assert — after disconnect, nothing is retained.
    assert store.get(alice) is None


def test_delete_is_idempotent_when_absent() -> None:
    # Arrange
    store = InMemoryByosConnectionStore()

    # Act / Assert — deleting a non-existent connection is a no-op, not an error.
    store.delete(UserKey(sub="nobody"))
    assert store.get(UserKey(sub="nobody")) is None
