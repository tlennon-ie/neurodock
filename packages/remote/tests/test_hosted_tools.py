# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Hosted storage-admin + combined-resolver tool tests (ADR 0010 Phase C).

These exercise the hosted path end-to-end through a real FastMCP ``Client``
against the combined server, with:

- a simulated authenticated user (we patch ``user_key_from_context`` in the state
  module — there is NO real Clerk here),
- a FAKE Turso platform client whose provisioned databases are local ``file:``
  libSQL files (there is NO real Turso here), and
- in-memory preference + BYOS connection stores.

Coverage:
- enable_hosted_storage → consent recorded, provision called once (idempotent on
  a second call), record_fact → recall_entity round-trips against the user's DB;
- two hosted users are isolated (distinct databases);
- disable_and_erase_storage (hosted) → destroy called + preference cleared;
- disable_and_erase_storage (byos) → connection cleared, hosted untouched;
- mode switching: a "none" record refuses; ANONYMOUS still gets
  STORAGE_NOT_AVAILABLE and nothing is stored/provisioned (the boundary, with the
  hosted path live).

``asyncio.run`` (not ``async def``) for the same reason as test_app.py.
"""

from __future__ import annotations

import asyncio
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any

import pytest
from fastmcp import Client, FastMCP
from neurodock_remote import state as state_module
from neurodock_remote.app import build_combined_server
from neurodock_state.byos_connection_store import InMemoryByosConnectionStore
from neurodock_state.hosted_resolver import _database_name
from neurodock_state.identity import UserKey
from neurodock_state.storage_preference_store import InMemoryStoragePreferenceStore


class _FakePlatform:
    """Fake Turso platform client backed by local ``file:`` libSQL DBs.

    Each provisioned database name maps to a per-test temp file URL (token-less),
    so the resolver's LibSqlStorage opens a real local SQLite DB and the
    cognitive-graph round-trip works without any network or real Turso.
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
        return None  # token-less local file DB

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


@contextmanager
def _as_user(monkeypatch: pytest.MonkeyPatch, sub: str | None) -> Iterator[None]:
    """Patch the request-context identity used by the state seam."""
    user = UserKey(sub=sub) if sub is not None else None
    monkeypatch.setattr(state_module, "user_key_from_context", lambda: user)
    yield


def _server(
    tmp_path: Path,
) -> tuple[
    FastMCP[Any],
    InMemoryStoragePreferenceStore,
    InMemoryByosConnectionStore,
    _FakePlatform,
]:
    preferences = InMemoryStoragePreferenceStore()
    connections = InMemoryByosConnectionStore()
    platform = _FakePlatform(tmp_path)
    server = build_combined_server(connections, preferences=preferences, platform=platform)
    return server, preferences, connections, platform


def _call(server: FastMCP[Any], tool: str, args: dict[str, Any]) -> dict[str, Any]:
    async def _run() -> dict[str, Any]:
        async with Client(server) as client:
            result = await client.call_tool(tool, args)
            return dict(result.data)

    return asyncio.run(_run())


# -- enable / round-trip / idempotency -----------------------------------


def test_enable_hosted_records_consent_and_round_trips(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    server, preferences, _, platform = _server(tmp_path)
    alice = UserKey(sub="user_alice")

    with _as_user(monkeypatch, "user_alice"):
        enabled = _call(server, "enable_hosted_storage", {})
        assert enabled["status"] == "enabled"
        assert enabled["mode"] == "hosted"
        assert "disclosure" in enabled  # explicit disclosure returned

        # Consent + mode recorded.
        pref = preferences.get(alice)
        assert pref is not None
        assert pref.mode == "hosted"
        assert pref.consent_at is not None
        assert pref.consent_version is not None

        status = _call(server, "storage_status", {})
        assert status == {"authenticated": True, "mode": "hosted", "connected": True}

        recorded = _call(
            server,
            "record_fact",
            {
                "subject": {"type": "person", "name": "Dana"},
                "predicate": "tagged",
                "object": {"literal": "engineer"},
            },
        )
        assert "error" not in recorded

        recalled = _call(server, "recall_entity", {"name_or_alias": "Dana"})

    assert recalled.get("entity") is not None
    assert recalled["entity"]["name"] == "Dana"
    # Provisioned exactly once (idempotent across the enable + graph calls).
    assert platform.created == [_database_name(alice)]


def test_enable_hosted_is_idempotent(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    server, _, _, platform = _server(tmp_path)
    alice = UserKey(sub="user_alice")
    with _as_user(monkeypatch, "user_alice"):
        _call(server, "enable_hosted_storage", {})
        _call(server, "enable_hosted_storage", {})
    # The second enable reuses the existing database — no second create.
    assert platform.created == [_database_name(alice)]


def test_two_hosted_users_are_isolated(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    server, _, _, platform = _server(tmp_path)

    with _as_user(monkeypatch, "user_alice"):
        _call(server, "enable_hosted_storage", {})
        _call(
            server,
            "record_fact",
            {
                "subject": {"type": "person", "name": "Dana"},
                "predicate": "tagged",
                "object": {"literal": "engineer"},
            },
        )

    with _as_user(monkeypatch, "user_bob"):
        _call(server, "enable_hosted_storage", {})
        bob_recall = _call(server, "recall_entity", {"name_or_alias": "Dana"})

    assert bob_recall.get("entity") is None
    assert set(platform.created) == {
        _database_name(UserKey(sub="user_alice")),
        _database_name(UserKey(sub="user_bob")),
    }


# -- erasure --------------------------------------------------------------


def test_disable_and_erase_hosted_destroys_db_and_clears_preference(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    server, preferences, _, platform = _server(tmp_path)
    alice = UserKey(sub="user_alice")

    with _as_user(monkeypatch, "user_alice"):
        _call(server, "enable_hosted_storage", {})
        erased = _call(server, "disable_and_erase_storage", {})
        assert erased["status"] == "erased"
        assert erased["mode"] == "none"
        status = _call(server, "storage_status", {})

    assert platform.destroyed == [_database_name(alice)]
    assert preferences.get(alice) is None
    # Still authenticated in context, but storage is back to none.
    assert status == {"authenticated": True, "mode": "none", "connected": False}


def test_disable_and_erase_byos_clears_connection_only(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    server, preferences, connections, platform = _server(tmp_path)
    alice = UserKey(sub="user_alice")

    with _as_user(monkeypatch, "user_alice"):
        _call(server, "connect_byos_storage", {"libsql_url": f"file:{tmp_path / 'alice.db'}"})
        assert connections.get(alice) is not None
        erased = _call(server, "disable_and_erase_storage", {})
        assert erased["status"] == "erased"

    # BYOS: connection + preference cleared; no hosted DB was ever destroyed.
    assert connections.get(alice) is None
    assert preferences.get(alice) is None
    assert platform.destroyed == []


# -- mode switching + the privacy boundary (with hosted live) ------------


def test_mode_none_record_is_refused(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from neurodock_state.storage_preference_store import StoragePreference

    server, preferences, _, _ = _server(tmp_path)
    alice = UserKey(sub="user_alice")
    preferences.put(alice, StoragePreference(mode="none"))

    with _as_user(monkeypatch, "user_alice"):
        payload = _call(server, "recall_entity", {"name_or_alias": "Dana"})

    assert payload["error"] == "STORAGE_NOT_CONNECTED"


def test_switch_byos_to_hosted(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    server, preferences, _connections, platform = _server(tmp_path)
    alice = UserKey(sub="user_alice")

    with _as_user(monkeypatch, "user_alice"):
        _call(server, "connect_byos_storage", {"libsql_url": f"file:{tmp_path / 'alice.db'}"})
        assert preferences.get(alice).mode == "byos"  # type: ignore[union-attr]

        _call(server, "enable_hosted_storage", {})
        status = _call(server, "storage_status", {})

    assert status["mode"] == "hosted"
    assert platform.created == [_database_name(alice)]


def test_switch_byos_to_hosted_clears_stale_byos_pointer(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # Regression (security review, finding 3): enabling hosted while a BYOS
    # connection exists must drop the stale BYOS pointer, so it cannot linger and
    # route a later write to the old database after the mode switched to hosted.
    server, preferences, connections, _platform = _server(tmp_path)
    alice = UserKey(sub="user_alice")

    with _as_user(monkeypatch, "user_alice"):
        _call(server, "connect_byos_storage", {"libsql_url": f"file:{tmp_path / 'alice.db'}"})
        assert connections.get(alice) is not None
        _call(server, "enable_hosted_storage", {})

    assert preferences.get(alice).mode == "hosted"  # type: ignore[union-attr]
    # The BYOS connection pointer is gone — not left dangling.
    assert connections.get(alice) is None


def test_connect_byos_refused_when_hosted_active_so_db_is_not_orphaned(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # Regression (security review, finding 1): a hosted user calling
    # connect_byos_storage must be refused, so the hosted Turso database is never
    # silently orphaned (it holds their data and is billable). They must run
    # disable_and_erase_storage first.
    server, preferences, connections, platform = _server(tmp_path)
    alice = UserKey(sub="user_alice")

    with _as_user(monkeypatch, "user_alice"):
        _call(server, "enable_hosted_storage", {})
        payload = _call(
            server, "connect_byos_storage", {"libsql_url": f"file:{tmp_path / 'alice.db'}"}
        )

    assert payload["error"] == "HOSTED_STORAGE_ACTIVE"
    # Still hosted; the hosted DB was neither destroyed nor orphaned, and no BYOS
    # pointer was written behind it.
    assert preferences.get(alice).mode == "hosted"  # type: ignore[union-attr]
    assert platform.destroyed == []
    assert connections.get(alice) is None


def test_disconnect_storage_refused_when_hosted_active(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # Regression (security review, finding 2): disconnect_storage only clears a
    # BYOS pointer; a hosted user must be refused (and pointed at
    # disable_and_erase_storage) so the hosted database is not orphaned.
    server, preferences, _connections, platform = _server(tmp_path)
    alice = UserKey(sub="user_alice")

    with _as_user(monkeypatch, "user_alice"):
        _call(server, "enable_hosted_storage", {})
        payload = _call(server, "disconnect_storage", {})
        status = _call(server, "storage_status", {})

    assert payload["error"] == "HOSTED_STORAGE_ACTIVE"
    # Preference untouched (still hosted) and the hosted DB intact.
    assert preferences.get(alice).mode == "hosted"  # type: ignore[union-attr]
    assert status == {"authenticated": True, "mode": "hosted", "connected": True}
    assert platform.destroyed == []


def test_anonymous_is_refused_and_nothing_is_provisioned(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # The boundary, re-asserted with the hosted path fully wired: an anonymous
    # caller is refused before any store is touched and NOTHING is provisioned.
    server, preferences, connections, platform = _server(tmp_path)

    with _as_user(monkeypatch, None):
        graph = _call(
            server,
            "record_fact",
            {
                "subject": {"type": "person", "name": "Mallory"},
                "predicate": "tagged",
                "object": {"literal": "should-not-persist"},
            },
        )
        enable = _call(server, "enable_hosted_storage", {})

    assert graph["error"] == "STORAGE_NOT_AVAILABLE"
    assert enable["error"] == "STORAGE_NOT_AVAILABLE"
    # Nothing provisioned, nothing stored.
    assert platform.created == []
    assert platform.destroyed == []
    assert len(preferences) == 0
    assert len(connections) == 0


def test_enable_hosted_refused_when_hosting_unconfigured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # No platform client wired in → hosted enablement is refused (BYOS still ok).
    connections = InMemoryByosConnectionStore()
    preferences = InMemoryStoragePreferenceStore()
    server = build_combined_server(connections, preferences=preferences, platform=None)

    with _as_user(monkeypatch, "user_alice"):
        payload = _call(server, "enable_hosted_storage", {})

    assert payload["error"] == "HOSTED_STORAGE_UNAVAILABLE"
    assert len(preferences) == 0
