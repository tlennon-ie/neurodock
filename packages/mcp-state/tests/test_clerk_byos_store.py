# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the Clerk-metadata BYOS store (ADR 0010 Phase D).

NO real Clerk and NO network: the Clerk Backend client is replaced with a fake
in-memory stand-in so we can prove the store's *own* logic — token encryption at
rest, the private_metadata shape, get/put/delete round-trips, and config
validation — without any external dependency. The encryption itself uses the
real ``cryptography`` Fernet path so the at-rest guarantee is genuinely tested.
"""

from __future__ import annotations

from typing import Any

import pytest
from neurodock_state.clerk_byos_store import (
    ByosStoreConfigError,
    ClerkMetadataByosStore,
)
from neurodock_state.identity import UserKey

_ENV = {
    "NEURODOCK_CLERK_SECRET_KEY": "sk_test_fake",
    "NEURODOCK_STATE_MASTER_KEY": "a-strong-master-key-for-tests",
}


class _FakeUsers:
    """Minimal stand-in for ``clerk.users`` backed by an in-memory dict."""

    def __init__(self) -> None:
        # user_id -> private_metadata dict
        self.metadata: dict[str, dict[str, Any]] = {}

    def get(self, *, user_id: str) -> Any:
        record = self.metadata.get(user_id, {})
        return type("ClerkUser", (), {"private_metadata": dict(record)})()

    def update_metadata(self, *, user_id: str, private_metadata: dict[str, Any]) -> None:
        # Mirror Clerk's merge semantics: keys with a None value are dropped.
        current = self.metadata.setdefault(user_id, {})
        for key, value in private_metadata.items():
            if value is None:
                current.pop(key, None)
            else:
                current[key] = value


class _FakeClerk:
    def __init__(self) -> None:
        self.users = _FakeUsers()


def _store_with_fake(env: dict[str, str]) -> tuple[ClerkMetadataByosStore, _FakeClerk]:
    """Build a store with the fake Clerk client injected (no SDK / network)."""
    impl = ClerkMetadataByosStore(env)
    fake = _FakeClerk()
    impl._client = fake
    return impl, fake


@pytest.fixture
def store() -> ClerkMetadataByosStore:
    impl, _ = _store_with_fake(_ENV)
    return impl


def test_requires_clerk_secret_key() -> None:
    with pytest.raises(ByosStoreConfigError):
        ClerkMetadataByosStore({"NEURODOCK_STATE_MASTER_KEY": "k"})


def test_requires_master_key() -> None:
    with pytest.raises(ByosStoreConfigError):
        ClerkMetadataByosStore({"NEURODOCK_CLERK_SECRET_KEY": "sk"})


def test_get_returns_none_when_no_connection(store: ClerkMetadataByosStore) -> None:
    assert store.get(UserKey(sub="user_alice")) is None


def test_put_then_get_round_trips(store: ClerkMetadataByosStore) -> None:
    # Arrange
    alice = UserKey(sub="user_alice")

    # Act
    store.put(alice, "libsql://alice.turso.io", auth_token="super-secret")
    connection = store.get(alice)

    # Assert — the token survives the encrypt-at-rest / decrypt-on-read trip.
    assert connection is not None
    assert connection.url == "libsql://alice.turso.io"
    assert connection.auth_token == "super-secret"


def test_token_is_encrypted_at_rest() -> None:
    # Arrange — hold the fake directly so we can inspect what was written.
    impl, fake = _store_with_fake(_ENV)
    alice = UserKey(sub="user_alice")
    impl.put(alice, "libsql://alice.turso.io", auth_token="super-secret")

    # Assert — the plaintext token never appears in what was written to Clerk.
    raw = fake.users.metadata["user_alice"]["neurodock_byos"]
    assert raw["auth_token"] != "super-secret"
    assert "super-secret" not in str(raw)


def test_put_without_token_stores_no_token(store: ClerkMetadataByosStore) -> None:
    alice = UserKey(sub="user_alice")
    store.put(alice, "file:/tmp/alice.db")
    connection = store.get(alice)
    assert connection is not None
    assert connection.auth_token is None


def test_delete_clears_the_connection(store: ClerkMetadataByosStore) -> None:
    alice = UserKey(sub="user_alice")
    store.put(alice, "libsql://alice.turso.io", auth_token="t")
    store.delete(alice)
    assert store.get(alice) is None


def test_wrong_master_key_cannot_decrypt() -> None:
    # Arrange — write with one master key.
    writer, fake = _store_with_fake(_ENV)
    writer.put(UserKey(sub="user_alice"), "libsql://x", auth_token="t")

    # A reader with a DIFFERENT master key sees the same metadata but cannot read.
    reader = ClerkMetadataByosStore(
        {**_ENV, "NEURODOCK_STATE_MASTER_KEY": "a-completely-different-key"}
    )
    reader._client = fake

    # Act / Assert — decryption fails loudly rather than returning garbage.
    from neurodock_state.clerk_byos_store import ByosStoreBackendError

    with pytest.raises(ByosStoreBackendError):
        reader.get(UserKey(sub="user_alice"))
