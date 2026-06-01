# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the combined hosted-or-BYOS resolver (ADR 0010 Phase C).

Proves the routing contract: the user's recorded preference mode selects which
backing answers storage_mode/graph_store, the two backings stay independent, and
the "none"/no-record default refuses with a LookupError (which the un-gating
layer turns into the structured "enable storage first" response).

NO real Turso, NO real Clerk: an in-memory preference store, a fake platform
client, and an in-memory BYOS connection store. The libSQL round-trip tests skip
cleanly without the cognitive-graph + libsql stack.
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest
from neurodock_state.byos_connection_store import InMemoryByosConnectionStore
from neurodock_state.byos_resolver import ByosResolver
from neurodock_state.combined_resolver import CombinedResolver
from neurodock_state.hosted_resolver import HostedTursoResolver, _database_name
from neurodock_state.identity import UserKey
from neurodock_state.registry import StateBackingResolver
from neurodock_state.storage_preference_store import (
    HostedDatabase,
    InMemoryStoragePreferenceStore,
    StoragePreference,
)

_HAS_LIBSQL_STACK = (
    importlib.util.find_spec("libsql") is not None
    and importlib.util.find_spec("neurodock_mcp_cognitive_graph") is not None
)

_needs_libsql = pytest.mark.skipif(
    not _HAS_LIBSQL_STACK,
    reason="requires the cognitive-graph package and the optional libsql client",
)

_GROUP = "default"


class _FilePlatform:
    """Fake platform returning a local file: DB URL so the round-trip is real."""

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
    def __init__(self, name: str, url: str) -> None:
        self.name = name
        self._url = url
        self.hostname = "local"

    @property
    def url(self) -> str:
        return self._url


def _build(
    tmp_path: Path,
) -> tuple[
    CombinedResolver,
    InMemoryStoragePreferenceStore,
    InMemoryByosConnectionStore,
    HostedTursoResolver,
    _FilePlatform,
]:
    preferences = InMemoryStoragePreferenceStore()
    connections = InMemoryByosConnectionStore()
    platform = _FilePlatform(tmp_path)
    hosted = HostedTursoResolver(platform=platform, preferences=preferences, group=_GROUP)  # type: ignore[arg-type]
    byos = ByosResolver(connections)
    combined = CombinedResolver(preferences=preferences, hosted=hosted, byos=byos)
    return combined, preferences, connections, hosted, platform


def test_combined_satisfies_protocol(tmp_path: Path) -> None:
    combined, *_ = _build(tmp_path)
    assert isinstance(combined, StateBackingResolver)


def test_no_record_is_none_and_graph_store_raises(tmp_path: Path) -> None:
    combined, *_ = _build(tmp_path)
    alice = UserKey(sub="alice")
    assert combined.storage_mode(alice) == "none"
    with pytest.raises(LookupError):
        combined.graph_store(alice)


def test_mode_none_record_is_refused(tmp_path: Path) -> None:
    combined, preferences, *_ = _build(tmp_path)
    alice = UserKey(sub="alice")
    preferences.put(alice, StoragePreference(mode="none"))
    assert combined.storage_mode(alice) == "none"
    with pytest.raises(LookupError):
        combined.graph_store(alice)


def test_routes_storage_mode_to_hosted(tmp_path: Path) -> None:
    combined, preferences, _, _, _ = _build(tmp_path)
    alice = UserKey(sub="alice")
    preferences.put(
        alice,
        StoragePreference(
            mode="hosted",
            database=HostedDatabase(name="nd-x", url="libsql://nd-x.turso.io", token="t"),
        ),
    )
    assert combined.storage_mode(alice) == "hosted"


def test_routes_storage_mode_to_byos(tmp_path: Path) -> None:
    combined, preferences, connections, _, _ = _build(tmp_path)
    alice = UserKey(sub="alice")
    connections.put(alice, "libsql://alice.turso.io", auth_token="t")
    preferences.put(alice, StoragePreference(mode="byos"))
    assert combined.storage_mode(alice) == "byos"


@_needs_libsql
def test_hosted_user_round_trips_through_combined(tmp_path: Path) -> None:
    from datetime import UTC, datetime

    from neurodock_mcp_cognitive_graph.clock import FixedClock
    from neurodock_mcp_cognitive_graph.tools import recall_entity as recall_entity_tool
    from neurodock_mcp_cognitive_graph.tools import record_fact as record_fact_tool

    combined, _, _, hosted, platform = _build(tmp_path)
    alice = UserKey(sub="alice")
    hosted.provision(alice)  # consent + provision via the hosted path
    clock = FixedClock(datetime(2026, 6, 1, 12, 0, tzinfo=UTC))

    store = combined.graph_store(alice)
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
    assert platform.created == [_database_name(alice)]


@_needs_libsql
def test_byos_user_round_trips_through_combined(tmp_path: Path) -> None:
    from datetime import UTC, datetime

    from neurodock_mcp_cognitive_graph.clock import FixedClock
    from neurodock_mcp_cognitive_graph.tools import recall_entity as recall_entity_tool
    from neurodock_mcp_cognitive_graph.tools import record_fact as record_fact_tool

    combined, preferences, connections, _, platform = _build(tmp_path)
    alice = UserKey(sub="alice")
    connections.put(alice, f"file:{tmp_path / 'alice-byos.db'}")
    preferences.put(alice, StoragePreference(mode="byos"))
    clock = FixedClock(datetime(2026, 6, 1, 12, 0, tzinfo=UTC))

    store = combined.graph_store(alice)
    store.initialise()
    try:
        record_fact_tool(
            store,
            clock,
            subject={"type": "person", "name": "Eli"},
            predicate="tagged",
            object={"literal": "designer"},
        )
        result = recall_entity_tool(store, "Eli")
    finally:
        store.close()

    assert result.entity is not None
    assert result.entity.name == "Eli"
    # The hosted platform was never touched for a BYOS user.
    assert platform.created == []
