# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for per-user identity derivation."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import Any

import neurodock_state.identity as identity
from neurodock_state.identity import UserKey, user_key_from_context


def test_storage_key_is_sha256_of_sub_and_never_the_raw_subject() -> None:
    # Arrange
    user = UserKey(sub="user_2abcDEF")

    # Act
    key = user.storage_key

    # Assert
    assert key == hashlib.sha256(b"user_2abcDEF").hexdigest()
    assert user.sub not in key  # raw subject never leaks into the key


def test_storage_key_is_stable_and_distinct_per_subject() -> None:
    # Arrange / Act / Assert
    assert UserKey(sub="a").storage_key == UserKey(sub="a").storage_key
    assert UserKey(sub="a").storage_key != UserKey(sub="b").storage_key


def test_user_key_from_context_returns_none_when_no_token() -> None:
    # Arrange: the real fastmcp accessor raises outside a request; the module
    # maps any failure to "no token".
    # Act
    result = user_key_from_context()

    # Assert
    assert result is None


@dataclass
class _StubToken:
    claims: dict[str, Any]


def test_user_key_from_context_returns_hashed_key_with_stubbed_token(
    monkeypatch: Any,
) -> None:
    # Arrange: stub the request-scoped accessor to return a token carrying a sub.
    monkeypatch.setattr(
        identity,
        "_get_access_token",
        lambda: _StubToken(claims={"sub": "user_99"}),
    )

    # Act
    result = user_key_from_context()

    # Assert
    assert result == UserKey(sub="user_99")
    assert result is not None
    assert result.storage_key == hashlib.sha256(b"user_99").hexdigest()


def test_user_key_from_context_returns_none_when_accessor_unavailable(
    monkeypatch: Any,
) -> None:
    # Arrange: simulate fastmcp not being importable.
    monkeypatch.setattr(identity, "_get_access_token", None)

    # Act / Assert
    assert user_key_from_context() is None


def test_user_key_from_context_returns_none_when_token_has_no_sub(
    monkeypatch: Any,
) -> None:
    # Arrange
    monkeypatch.setattr(
        identity,
        "_get_access_token",
        lambda: _StubToken(claims={"not_sub": "x"}),
    )

    # Act / Assert
    assert user_key_from_context() is None


def test_user_key_from_context_returns_none_when_accessor_raises(
    monkeypatch: Any,
) -> None:
    # Arrange: no active request context surfaces as an exception in fastmcp.
    def _raise() -> Any:
        raise RuntimeError("no active request")

    monkeypatch.setattr(identity, "_get_access_token", _raise)

    # Act / Assert
    assert user_key_from_context() is None
