# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""BYOS storage-admin + un-gated cognitive-graph tool tests (ADR 0010 Phase D).

These exercise the privacy boundary and the BYOS round-trip end-to-end through a
real FastMCP ``Client`` against the combined server, with:

- a simulated authenticated user (we patch ``user_key_from_context`` in the state
  module — there is NO real Clerk here), and
- a real local ``file:`` libSQL database per user (there is NO real Turso here).

Coverage:
- authenticated but not connected → "enable storage first" (STORAGE_NOT_CONNECTED);
- connect → record_fact → recall_entity round-trips against the user's own DB;
- a second distinct user is isolated (cannot see the first user's data);
- connect rejects a malformed URL scheme;
- disconnect clears the stored connection.

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
from neurodock_state.identity import UserKey


@contextmanager
def _as_user(monkeypatch: pytest.MonkeyPatch, sub: str | None) -> Iterator[None]:
    """Patch the request-context identity used by the state seam.

    ``sub=None`` simulates an anonymous caller; a string simulates a signed-in
    user with that Clerk subject. We patch the name as imported into the state
    module (``from ... import user_key_from_context``), which is where every
    auth decision is made.
    """
    user = UserKey(sub=sub) if sub is not None else None
    monkeypatch.setattr(state_module, "user_key_from_context", lambda: user)
    yield


def _call(server: FastMCP[Any], tool: str, args: dict[str, Any]) -> dict[str, Any]:
    async def _run() -> dict[str, Any]:
        async with Client(server) as client:
            result = await client.call_tool(tool, args)
            return dict(result.data)

    return asyncio.run(_run())


# -- not connected --------------------------------------------------------


def test_authenticated_but_not_connected_is_told_to_enable_storage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Arrange — signed in, but no connection on file.
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)

    # Act / Assert
    with _as_user(monkeypatch, "user_alice"):
        payload = _call(server, "recall_entity", {"name_or_alias": "Dana"})
    assert payload["error"] == "STORAGE_NOT_CONNECTED"


def test_storage_status_authenticated_not_connected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)
    with _as_user(monkeypatch, "user_alice"):
        payload = _call(server, "storage_status", {})
    assert payload == {"authenticated": True, "mode": "none", "connected": False}


# -- connect / round-trip / isolation ------------------------------------


def test_connect_then_round_trip_against_the_users_own_db(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    # Arrange — a local libSQL file stands in for Alice's own database.
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)
    alice_db = f"file:{tmp_path / 'alice.db'}"

    with _as_user(monkeypatch, "user_alice"):
        # Connect (smoke-tests + persists).
        connected = _call(server, "connect_byos_storage", {"libsql_url": alice_db})
        assert connected["status"] == "connected"
        assert connected["mode"] == "byos"

        # Status now reflects the connection.
        status = _call(server, "storage_status", {})
        assert status == {"authenticated": True, "mode": "byos", "connected": True}

        # Write a fact, then read it back — against Alice's own DB.
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
    # The only thing NeuroDock stored is the connection pointer.
    assert connections.get(UserKey(sub="user_alice")) is not None


def test_second_user_is_isolated(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    # Arrange — two users, two separate local libSQL files.
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)
    alice_db = f"file:{tmp_path / 'alice.db'}"
    bob_db = f"file:{tmp_path / 'bob.db'}"

    # Alice connects and records.
    with _as_user(monkeypatch, "user_alice"):
        _call(server, "connect_byos_storage", {"libsql_url": alice_db})
        _call(
            server,
            "record_fact",
            {
                "subject": {"type": "person", "name": "Dana"},
                "predicate": "tagged",
                "object": {"literal": "engineer"},
            },
        )

    # Bob connects to his OWN db and looks for Alice's entity.
    with _as_user(monkeypatch, "user_bob"):
        _call(server, "connect_byos_storage", {"libsql_url": bob_db})
        bob_recall = _call(server, "recall_entity", {"name_or_alias": "Dana"})

    # Assert — cross-tenant isolation: Bob cannot see Alice's data.
    assert bob_recall.get("entity") is None


# -- URL validation / disconnect -----------------------------------------


def test_connect_rejects_a_malformed_url(monkeypatch: pytest.MonkeyPatch) -> None:
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)

    with _as_user(monkeypatch, "user_alice"):
        payload = _call(
            server, "connect_byos_storage", {"libsql_url": "postgres://nope.example/db"}
        )

    assert payload["error"] == "INVALID_STORAGE_URL"
    # A rejected URL must NOT be persisted.
    assert connections.get(UserKey(sub="user_alice")) is None


def test_connect_rejects_empty_url(monkeypatch: pytest.MonkeyPatch) -> None:
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)

    with _as_user(monkeypatch, "user_alice"):
        payload = _call(server, "connect_byos_storage", {"libsql_url": "   "})

    assert payload["error"] == "INVALID_STORAGE_URL"
    assert connections.get(UserKey(sub="user_alice")) is None


def test_disconnect_clears_the_connection(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    # Arrange — Alice connects.
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)
    alice = UserKey(sub="user_alice")

    with _as_user(monkeypatch, "user_alice"):
        _call(server, "connect_byos_storage", {"libsql_url": f"file:{tmp_path / 'alice.db'}"})
        assert connections.get(alice) is not None

        # Act — disconnect.
        payload = _call(server, "disconnect_storage", {})

        # Assert — nothing retained; status back to none.
        assert payload["status"] == "disconnected"
        status = _call(server, "storage_status", {})

    assert status == {"authenticated": True, "mode": "none", "connected": False}
    assert connections.get(alice) is None


def test_anonymous_cannot_connect(monkeypatch: pytest.MonkeyPatch) -> None:
    # Even the connect tool refuses anonymous callers — nothing is stored.
    connections = InMemoryByosConnectionStore()
    server = build_combined_server(connections)

    with _as_user(monkeypatch, None):
        payload = _call(server, "connect_byos_storage", {"libsql_url": "libsql://x.turso.io"})

    assert payload["error"] == "STORAGE_NOT_AVAILABLE"
    assert len(connections) == 0
