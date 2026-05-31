# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Per-user backing resolution (ADR 0010 Phase B).

A :class:`StateBackingResolver` maps a :class:`UserKey` to the concrete backings
the stateful tools need: a cognitive-graph store, a session store, a profile
store, and the user's effective storage mode. The hosted (Phase C) and BYOS
(Phase D) resolvers will implement this protocol; Phase B ships the protocol
plus :class:`MemoryBackingResolver`, an infra-free implementation that proves
per-user isolation entirely in memory.

To keep this package dependency-light, the graph store is typed against a
minimal **structural** :class:`GraphStore` protocol declared here rather than
importing the cognitive-graph package. The cognitive-graph ``Storage`` protocol
is a structural superset of :class:`GraphStore`, so a real ``Storage`` satisfies
this return type without any import-time coupling.
"""

from __future__ import annotations

from typing import Literal, Protocol, runtime_checkable

from neurodock_state.identity import UserKey
from neurodock_state.profile_store import InMemoryProfileStore, ProfileStore
from neurodock_state.session_store import InMemorySessionStore, SessionStore

StorageMode = Literal["hosted", "byos", "none"]
"""Where a user's stateful data lives.

- ``"hosted"`` — NeuroDock-managed per-user storage (ADR 0010 Phase C).
- ``"byos"``   — the user's own libSQL/Turso connection (ADR 0010 Phase D).
- ``"none"``   — no per-user stateful storage (anonymous / stateless surface).
"""


@runtime_checkable
class GraphStore(Protocol):
    """Minimal structural view of a cognitive-graph store.

    Declared here so :mod:`neurodock_state` does not depend on the
    cognitive-graph package. The cognitive-graph ``Storage`` protocol is a
    superset of this, so any real ``Storage`` is a valid :class:`GraphStore`.
    Only the lifecycle surface the resolver and tests rely on is declared.
    """

    def initialise(self) -> None:
        """Apply schema migrations. Idempotent."""
        ...

    def close(self) -> None:
        """Release any open resources."""
        ...


class _InMemoryGraphStore:
    """Trivial infra-free :class:`GraphStore` used by :class:`MemoryBackingResolver`.

    Phase B only needs to prove that distinct users receive distinct, isolated
    graph backings. A full in-memory graph implementation lives in the
    cognitive-graph package; duplicating it here would couple the two. This stub
    satisfies the structural :class:`GraphStore` contract and nothing more.
    """

    def __init__(self) -> None:
        self.initialised = False
        self.closed = False

    def initialise(self) -> None:
        self.initialised = True

    def close(self) -> None:
        self.closed = True


@runtime_checkable
class StateBackingResolver(Protocol):
    """Resolve the per-user backings for the stateful tools."""

    def graph_store(self, user: UserKey) -> GraphStore:
        """Return ``user``'s cognitive-graph store."""
        ...

    def session_store(self, user: UserKey) -> SessionStore:
        """Return ``user``'s session store."""
        ...

    def profile_store(self, user: UserKey) -> ProfileStore:
        """Return ``user``'s profile store."""
        ...

    def storage_mode(self, user: UserKey) -> StorageMode:
        """Return ``user``'s effective storage mode."""
        ...


class _Backing:
    """The triple of stores held for one user by :class:`MemoryBackingResolver`."""

    __slots__ = ("graph", "profile", "session")

    def __init__(self) -> None:
        self.graph: GraphStore = _InMemoryGraphStore()
        self.session: SessionStore = InMemorySessionStore()
        self.profile: ProfileStore = InMemoryProfileStore()


class MemoryBackingResolver:
    """In-memory :class:`StateBackingResolver`: one isolated backing per user.

    Backings are created lazily and cached by :attr:`UserKey.storage_key`, so
    repeated calls for the same user return the *same* store instances, and two
    distinct users always receive *distinct* instances. No external
    infrastructure is touched — this is the Phase B isolation proof.

    Reports :data:`StorageMode` ``"hosted"`` for every authenticated user: the
    backing is NeuroDock-managed (in-process), matching the Phase C semantics it
    stands in for.
    """

    def __init__(self) -> None:
        self._backings: dict[str, _Backing] = {}

    def _backing_for(self, user: UserKey) -> _Backing:
        backing = self._backings.get(user.storage_key)
        if backing is None:
            backing = _Backing()
            self._backings[user.storage_key] = backing
        return backing

    def graph_store(self, user: UserKey) -> GraphStore:
        return self._backing_for(user).graph

    def session_store(self, user: UserKey) -> SessionStore:
        return self._backing_for(user).session

    def profile_store(self, user: UserKey) -> ProfileStore:
        return self._backing_for(user).profile

    def storage_mode(self, user: UserKey) -> StorageMode:
        return "hosted"
