# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""BYOS per-user backing resolver (ADR 0010 Phase D).

:class:`ByosResolver` is the :class:`~neurodock_state.registry.StateBackingResolver`
for the bring-your-own-storage path. It reads each user's connection from a
:class:`~neurodock_state.byos_connection_store.ByosConnectionStore` and returns a
cognitive-graph store pointed at the **user's own** libSQL/Turso database.

- :meth:`storage_mode` is ``"byos"`` when the user has a connection on file, else
  ``"none"``. The ``"none"`` case is the security default: a user who has not
  opted in (no stored connection) gets no storage, and the un-gating layer turns
  that into a structured "enable storage first" response without touching any
  store.
- :meth:`graph_store` builds a :class:`LibSqlStorage` from the stored connection.
  The cognitive-graph package is imported **lazily** so :mod:`neurodock_state`
  stays dependency-light and importable without it.
- :meth:`session_store` / :meth:`profile_store` raise :class:`NotImplementedError`:
  chronometric session persistence and the hosted profile are **out of scope for
  Phase D** (tracked as a follow-up). Only the four cognitive-graph tools are
  un-gated in this phase.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, cast

from neurodock_state.byos_connection_store import ByosConnectionStore
from neurodock_state.identity import UserKey
from neurodock_state.registry import GraphStore, StorageMode

if TYPE_CHECKING:  # pragma: no cover - typing only
    from neurodock_state.profile_store import ProfileStore
    from neurodock_state.session_store import SessionStore

_SESSION_PROFILE_DEFERRED = (
    "BYOS session/profile persistence is out of scope for ADR 0010 Phase D; "
    "only the four cognitive-graph tools are un-gated. This is a tracked follow-up."
)


class ByosResolver:
    """Resolve per-user cognitive-graph backings from stored BYOS connections.

    Stateless apart from the injected connection store: every resolution reads
    the user's connection fresh, so a disconnect (delete) takes effect on the
    very next call.
    """

    def __init__(self, connections: ByosConnectionStore) -> None:
        self._connections = connections

    def storage_mode(self, user: UserKey) -> StorageMode:
        return "byos" if self._connections.get(user) is not None else "none"

    def graph_store(self, user: UserKey) -> GraphStore:
        connection = self._connections.get(user)
        if connection is None:
            # Callers MUST check storage_mode() first; this guards the invariant.
            raise LookupError(
                "no BYOS connection on file for this user; call storage_mode() before graph_store()"
            )
        # Lazy import: keep neurodock_state free of a hard cognitive-graph
        # dependency. The hosted image installs the cognitive-graph package and
        # its `libsql` extra; the resolver only needs them when actually serving.
        from neurodock_mcp_cognitive_graph.storage.libsql import LibSqlStorage

        # LibSqlStorage is a structural superset of GraphStore (it has
        # initialise/close), but the cognitive-graph package ships without
        # py.typed so mypy sees it as Any here; cast to the declared return type.
        return cast(GraphStore, LibSqlStorage(connection.url, auth_token=connection.auth_token))

    def session_store(self, user: UserKey) -> SessionStore:
        raise NotImplementedError(_SESSION_PROFILE_DEFERRED)

    def profile_store(self, user: UserKey) -> ProfileStore:
        raise NotImplementedError(_SESSION_PROFILE_DEFERRED)
