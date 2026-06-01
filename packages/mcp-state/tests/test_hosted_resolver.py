# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the hosted Turso per-user resolver (ADR 0010 Phase C).

NO real Turso and NO real Clerk: a fake :class:`TursoPlatformClient` records the
provisioning calls and maps each provisioned database name to a local ``file:``
libSQL DB, so ``record_fact`` → ``recall_entity`` actually round-trips against the
"hosted" store. The preference store is the in-memory reference impl.

The libSQL round-trip tests skip cleanly when the cognitive-graph package or the
optional ``libsql`` client is unavailable, mirroring the BYOS resolver tests.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from neurodock_state.hosted_resolver import HostedTursoResolver, _database_name
from neurodock_state.identity import UserKey
from neurodock_state.registry import StateBackingResolver
from neurodock_state.storage_preference_store import InMemoryStoragePreferenceStore
from neurodock_state.turso_platform import DatabaseInfo

_HAS_LIBSQL_STACK = (
    importlib.util.find_spec("libsql") is not None
    and importlib.util.find_spec("neurodock_mcp_cognitive_graph") is not None
)

_needs_libsql = pytest.mark.skipif(
    not _HAS_LIBSQL_STACK,
    reason="requires the cognitive-graph package and the optional libsql client",
)

_GROUP = "default"


class _FakePlatform:
    """Fake :class:`TursoPlatformClient` that records calls (no real Turso).

    Used by the contract tests that only assert which databases were created /
    destroyed and that consent was recorded. Returns a synthetic
    :class:`DatabaseInfo`; the end-to-end round-trip tests use :class:`_FilePlatform`
    (below), whose URL points at a real local ``file:`` libSQL DB.
    """

    def __init__(self, tmp_path: Path) -> None:
        self.created: list[str] = []
        self.tokens: list[str] = []
        self.destroyed: list[str] = []

    def create_database(self, name: str, group: str) -> DatabaseInfo:
        assert group == _GROUP
        self.created.append(name)
        return DatabaseInfo(name=name, hostname=f"{name}.local")

    def create_token(self, name: str) -> str:
        token = f"token-for-{name}"
        self.tokens.append(token)
        return token

    def destroy_database(self, name: str) -> None:
        self.destroyed.append(name)


def _resolver(platform: object, preferences: InMemoryStoragePreferenceStore) -> HostedTursoResolver:
    return HostedTursoResolver(platform=platform, preferences=preferences, group=_GROUP)  # type: ignore[arg-type]


def test_resolver_satisfies_protocol(tmp_path: Path) -> None:
    resolver = _resolver(_FakePlatform(tmp_path), InMemoryStoragePreferenceStore())
    assert isinstance(resolver, StateBackingResolver)


def test_storage_mode_is_none_until_provisioned(tmp_path: Path) -> None:
    resolver = _resolver(_FakePlatform(tmp_path), InMemoryStoragePreferenceStore())
    # The security default: no consent => no storage, nothing provisioned.
    assert resolver.storage_mode(UserKey(sub="alice")) == "none"


def test_database_name_is_deterministic_and_opaque() -> None:
    alice = UserKey(sub="alice")
    # Deterministic per user, opaque (no raw sub), and within Turso's 64-char limit.
    assert _database_name(alice) == _database_name(UserKey(sub="alice"))
    assert _database_name(alice) != _database_name(UserKey(sub="bob"))
    assert "alice" not in _database_name(alice)
    assert len(_database_name(alice)) <= 64


def test_provision_records_consent_and_calls_platform_once(tmp_path: Path) -> None:
    platform = _FakePlatform(tmp_path)
    preferences = InMemoryStoragePreferenceStore()
    resolver = _resolver(platform, preferences)
    alice = UserKey(sub="alice")

    db1 = resolver.provision(alice)

    # Consent recorded, mode is hosted, database pointer stored.
    pref = preferences.get(alice)
    assert pref is not None
    assert pref.mode == "hosted"
    assert pref.consent_at is not None
    assert pref.consent_version is not None
    assert pref.database is not None
    assert resolver.storage_mode(alice) == "hosted"
    assert platform.created == [_database_name(alice)]

    # Idempotent: a second provision reuses the existing DB, no new create call.
    db2 = resolver.provision(alice)
    assert db2 == db1
    assert platform.created == [_database_name(alice)]


def test_erase_destroys_database_and_clears_preference(tmp_path: Path) -> None:
    platform = _FakePlatform(tmp_path)
    preferences = InMemoryStoragePreferenceStore()
    resolver = _resolver(platform, preferences)
    alice = UserKey(sub="alice")

    resolver.provision(alice)
    resolver.erase(alice)

    assert platform.destroyed == [_database_name(alice)]
    assert preferences.get(alice) is None
    assert resolver.storage_mode(alice) == "none"


def test_erase_is_idempotent_without_a_database(tmp_path: Path) -> None:
    platform = _FakePlatform(tmp_path)
    preferences = InMemoryStoragePreferenceStore()
    resolver = _resolver(platform, preferences)
    # No raise even though nothing was ever provisioned.
    resolver.erase(UserKey(sub="alice"))
    assert platform.destroyed == []


# -- libSQL round-trip (real local file: DB) -----------------------------


class _FilePlatform:
    """Fake platform whose DatabaseInfo.url is a local ``file:`` URL (token-less).

    Lets the resolver's LibSqlStorage open a real local SQLite DB for the
    end-to-end round-trip. ``create_token`` returns ``None``-equivalent by way of
    a sentinel the resolver passes to LibSqlStorage; we use a token-less file DB,
    so we return an empty token and rely on LibSqlStorage ignoring it for file:.
    """

    def __init__(self, tmp_path: Path) -> None:
        self._tmp = tmp_path
        self.created: list[str] = []
        self.destroyed: list[str] = []
        self._urls: dict[str, str] = {}

    def create_database(self, name: str, group: str):  # type: ignore[no-untyped-def]
        self.created.append(name)
        url = self._urls.setdefault(name, f"file:{self._tmp / (name + '.db')}")
        return _FileInfo(name=name, url=url)

    def create_token(self, name: str) -> str | None:
        return None

    def destroy_database(self, name: str) -> None:
        self.destroyed.append(name)


class _FileInfo:
    """DatabaseInfo-shaped object whose ``url`` is a local file: URL."""

    def __init__(self, name: str, url: str) -> None:
        self.name = name
        self._url = url
        self.hostname = "local"

    @property
    def url(self) -> str:
        return self._url


@_needs_libsql
def test_hosted_round_trips_record_then_recall(tmp_path: Path) -> None:
    from datetime import UTC, datetime

    from neurodock_mcp_cognitive_graph.clock import FixedClock
    from neurodock_mcp_cognitive_graph.tools import recall_entity as recall_entity_tool
    from neurodock_mcp_cognitive_graph.tools import record_fact as record_fact_tool

    platform = _FilePlatform(tmp_path)
    preferences = InMemoryStoragePreferenceStore()
    resolver = _resolver(platform, preferences)
    alice = UserKey(sub="alice")
    clock = FixedClock(datetime(2026, 6, 1, 12, 0, tzinfo=UTC))

    # graph_store provisions on demand (no explicit provision() first).
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

    assert result.entity is not None
    assert result.entity.name == "Dana"
    # Provisioning happened exactly once and is now recorded as hosted.
    assert platform.created == [_database_name(alice)]
    assert resolver.storage_mode(alice) == "hosted"


@_needs_libsql
def test_two_hosted_users_get_isolated_databases(tmp_path: Path) -> None:
    from datetime import UTC, datetime

    from neurodock_mcp_cognitive_graph.clock import FixedClock
    from neurodock_mcp_cognitive_graph.tools import recall_entity as recall_entity_tool
    from neurodock_mcp_cognitive_graph.tools import record_fact as record_fact_tool

    platform = _FilePlatform(tmp_path)
    preferences = InMemoryStoragePreferenceStore()
    resolver = _resolver(platform, preferences)
    alice = UserKey(sub="alice")
    bob = UserKey(sub="bob")
    clock = FixedClock(datetime(2026, 6, 1, 12, 0, tzinfo=UTC))

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

    # Distinct databases → Bob cannot see Alice's data.
    assert bob_result.entity is None
    assert _database_name(alice) != _database_name(bob)
    assert set(platform.created) == {_database_name(alice), _database_name(bob)}
