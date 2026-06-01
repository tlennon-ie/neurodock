# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the storage-preference store (ADR 0010 Phase C).

The in-memory store proves the routing/consent/erasure contract with no infra.
The Clerk-metadata store is tested with a fake Clerk client (NO real Clerk, NO
network), proving the record shape, hosted-DB-token encryption at rest, and
get/put/clear round-trips. The encryption uses the real ``cryptography`` Fernet
path so the at-rest guarantee is genuinely tested.
"""

from __future__ import annotations

import importlib.util
from typing import Any

import pytest
from neurodock_state.identity import UserKey
from neurodock_state.storage_preference_store import (
    HostedDatabase,
    InMemoryStoragePreferenceStore,
    StoragePreference,
    StoragePreferenceStore,
    with_mode,
)

_HAS_CRYPTO = importlib.util.find_spec("cryptography") is not None

_ENV = {
    "NEURODOCK_CLERK_SECRET_KEY": "sk_test_fake",
    "NEURODOCK_STATE_MASTER_KEY": "a-strong-master-key-for-tests",
}


# -- in-memory contract ---------------------------------------------------


def test_in_memory_satisfies_protocol() -> None:
    assert isinstance(InMemoryStoragePreferenceStore(), StoragePreferenceStore)


def test_in_memory_get_is_none_when_unset() -> None:
    store = InMemoryStoragePreferenceStore()
    assert store.get(UserKey(sub="alice")) is None


def test_in_memory_put_then_get_round_trips() -> None:
    store = InMemoryStoragePreferenceStore()
    alice = UserKey(sub="alice")
    pref = StoragePreference(
        mode="hosted",
        consent_at="2026-06-01T00:00:00+00:00",
        consent_version="2026-06-01",
        database=HostedDatabase(name="nd-x", url="libsql://nd-x.turso.io", token="t"),
    )
    store.put(alice, pref)
    assert store.get(alice) == pref


def test_in_memory_clear_removes_record() -> None:
    store = InMemoryStoragePreferenceStore()
    alice = UserKey(sub="alice")
    store.put(alice, StoragePreference(mode="byos"))
    store.clear(alice)
    assert store.get(alice) is None
    assert len(store) == 0


def test_in_memory_is_per_user() -> None:
    store = InMemoryStoragePreferenceStore()
    store.put(UserKey(sub="alice"), StoragePreference(mode="hosted"))
    assert store.get(UserKey(sub="bob")) is None


def test_with_mode_is_immutable() -> None:
    pref = StoragePreference(mode="hosted", consent_version="v1")
    switched = with_mode(pref, "none")
    assert switched.mode == "none"
    assert switched.consent_version == "v1"  # other fields preserved
    assert pref.mode == "hosted"  # original untouched
    assert with_mode(None, "none") == StoragePreference(mode="none")


# -- Clerk-metadata backing ----------------------------------------------

_clerk_only = pytest.mark.skipif(
    not _HAS_CRYPTO, reason="requires the optional cryptography package"
)


class _FakeUsers:
    def __init__(self) -> None:
        self.metadata: dict[str, dict[str, Any]] = {}

    def get(self, *, user_id: str) -> Any:
        record = self.metadata.get(user_id, {})
        return type("ClerkUser", (), {"private_metadata": dict(record)})()

    def update_metadata(self, *, user_id: str, private_metadata: dict[str, Any]) -> None:
        current = self.metadata.setdefault(user_id, {})
        for key, value in private_metadata.items():
            if value is None:
                current.pop(key, None)
            else:
                current[key] = value


class _FakeClerk:
    def __init__(self) -> None:
        self.users = _FakeUsers()


def _store_with_fake(env: dict[str, str]):  # type: ignore[no-untyped-def]
    from neurodock_state.storage_preference_store import ClerkMetadataPreferenceStore

    impl = ClerkMetadataPreferenceStore(env)
    fake = _FakeClerk()
    impl._client = fake
    return impl, fake


@_clerk_only
def test_clerk_requires_secrets() -> None:
    from neurodock_state.storage_preference_store import (
        ClerkMetadataPreferenceStore,
        PreferenceStoreConfigError,
    )

    with pytest.raises(PreferenceStoreConfigError):
        ClerkMetadataPreferenceStore({"NEURODOCK_STATE_MASTER_KEY": "k"})
    with pytest.raises(PreferenceStoreConfigError):
        ClerkMetadataPreferenceStore({"NEURODOCK_CLERK_SECRET_KEY": "sk"})


@_clerk_only
def test_clerk_get_is_none_when_unset() -> None:
    store, _ = _store_with_fake(_ENV)
    assert store.get(UserKey(sub="alice")) is None


@_clerk_only
def test_clerk_round_trips_a_hosted_preference() -> None:
    store, _ = _store_with_fake(_ENV)
    alice = UserKey(sub="alice")
    pref = StoragePreference(
        mode="hosted",
        consent_at="2026-06-01T00:00:00+00:00",
        consent_version="2026-06-01",
        database=HostedDatabase(name="nd-x", url="libsql://nd-x.turso.io", token="db-secret"),
    )
    store.put(alice, pref)
    loaded = store.get(alice)
    assert loaded == pref


@_clerk_only
def test_clerk_encrypts_db_token_at_rest() -> None:
    store, fake = _store_with_fake(_ENV)
    alice = UserKey(sub="alice")
    store.put(
        alice,
        StoragePreference(
            mode="hosted",
            database=HostedDatabase(name="nd-x", url="libsql://nd-x.turso.io", token="db-secret"),
        ),
    )
    raw = fake.users.metadata["alice"]["neurodock_storage_pref"]
    assert raw["database"]["token"] != "db-secret"
    assert "db-secret" not in str(raw)


@_clerk_only
def test_clerk_clear_removes_record() -> None:
    store, _ = _store_with_fake(_ENV)
    alice = UserKey(sub="alice")
    store.put(alice, StoragePreference(mode="hosted"))
    store.clear(alice)
    assert store.get(alice) is None


@_clerk_only
def test_clerk_wrong_master_key_cannot_decrypt_token() -> None:
    from neurodock_state.storage_preference_store import (
        ClerkMetadataPreferenceStore,
        PreferenceStoreBackendError,
    )

    writer, fake = _store_with_fake(_ENV)
    writer.put(
        UserKey(sub="alice"),
        StoragePreference(
            mode="hosted",
            database=HostedDatabase(name="nd-x", url="libsql://x", token="t"),
        ),
    )
    reader = ClerkMetadataPreferenceStore(
        {**_ENV, "NEURODOCK_STATE_MASTER_KEY": "a-completely-different-key"}
    )
    reader._client = fake
    with pytest.raises(PreferenceStoreBackendError):
        reader.get(UserKey(sub="alice"))
