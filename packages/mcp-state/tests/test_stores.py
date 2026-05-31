# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the in-memory reference session and profile stores."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from neurodock_state.identity import UserKey
from neurodock_state.profile_store import InMemoryProfileStore, ProfileStore
from neurodock_state.session_store import (
    InMemorySessionStore,
    Session,
    SessionStore,
)

NOW = datetime(2026, 5, 31, 12, 0, tzinfo=UTC)
USER = UserKey(sub="alice")


def test_in_memory_session_store_satisfies_protocol() -> None:
    assert isinstance(InMemorySessionStore(), SessionStore)


def test_open_then_current_returns_open_session() -> None:
    # Arrange
    store = InMemorySessionStore()

    # Act
    opened = store.open_session(USER, "s1", "deep work", now=NOW)

    # Assert
    assert opened.is_open
    assert store.current_session(USER) == opened
    assert opened.user_key == USER.storage_key


def test_touch_bumps_last_touched_without_mutating_original() -> None:
    # Arrange
    store = InMemorySessionStore()
    opened = store.open_session(USER, "s1", "deep work", now=NOW)
    later = NOW + timedelta(minutes=5)

    # Act
    touched = store.touch_session(USER, now=later)

    # Assert — immutability: the original instance is unchanged.
    assert touched is not None
    assert touched.last_touched_at == later
    assert opened.last_touched_at == NOW
    assert touched.started_at == NOW


def test_close_ends_session_and_current_returns_none() -> None:
    # Arrange
    store = InMemorySessionStore()
    store.open_session(USER, "s1", "deep work", now=NOW)
    later = NOW + timedelta(minutes=30)

    # Act
    closed = store.close_session(USER, now=later)

    # Assert
    assert closed is not None
    assert not closed.is_open
    assert closed.ended_at == later
    assert store.current_session(USER) is None


def test_touch_and_close_on_no_session_return_none() -> None:
    # Arrange
    store = InMemorySessionStore()

    # Act / Assert
    assert store.touch_session(USER, now=NOW) is None
    assert store.close_session(USER, now=NOW) is None
    assert store.current_session(USER) is None


def test_session_is_frozen_dataclass() -> None:
    session = Session(
        session_id="s1",
        user_key=USER.storage_key,
        intent="x",
        started_at=NOW,
        last_touched_at=NOW,
    )
    try:
        session.intent = "y"  # type: ignore[misc]
    except AttributeError:
        return
    raise AssertionError("Session should be immutable")


def test_in_memory_profile_store_satisfies_protocol() -> None:
    assert isinstance(InMemoryProfileStore(), ProfileStore)


def test_profile_get_returns_none_before_put() -> None:
    store = InMemoryProfileStore()
    assert store.get_profile(USER) is None


def test_profile_put_then_get_roundtrips_a_copy() -> None:
    # Arrange
    store = InMemoryProfileStore()
    original = {"theme": "calm", "nested": {"a": 1}}

    # Act
    store.put_profile(USER, original)
    fetched = store.get_profile(USER)

    # Assert — value-equal but defensively copied (no shared references).
    assert fetched == original
    assert fetched is not original

    # Mutating the input after put must not change stored state.
    original["theme"] = "loud"
    assert store.get_profile(USER) == {"theme": "calm", "nested": {"a": 1}}

    # Mutating a fetched copy must not change stored state either.
    assert fetched is not None
    fetched["theme"] = "loud"
    assert store.get_profile(USER) == {"theme": "calm", "nested": {"a": 1}}
