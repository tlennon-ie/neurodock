# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Per-user BYOS connection storage (ADR 0010 Phase D).

A *BYOS connection* is the libSQL/Turso endpoint a user has chosen to own their
own cognitive-graph data. It is the **only** per-user state NeuroDock holds on
the hosted path, and even that is intentionally minimal: a URL plus an
(encrypted) auth token. The graph rows themselves never touch NeuroDock — they
live in the user's database.

This module defines:

- :class:`Connection` — the immutable (url, token) pair for one user.
- :class:`ByosConnectionStore` — the storage contract (``get``/``put``/``delete``).
- :class:`InMemoryByosConnectionStore` — an infra-free reference impl for tests.
- :class:`ClerkMetadataByosStore` — persists the connection in the user's Clerk
  ``private_metadata`` via the Clerk Backend API, encrypting the token with a
  master key. The Clerk SDK is imported lazily so importing this module never
  fails on a host without it.

Security posture
----------------
- The auth token is a **secret**. :class:`ClerkMetadataByosStore` encrypts it at
  rest (Fernet/AES, key from ``NEURODOCK_STATE_MASTER_KEY``) before it is ever
  written to Clerk metadata; it is decrypted only in-process when a store is
  resolved for a call.
- The connection is keyed by :attr:`UserKey.storage_key` (the SHA-256 of the
  Clerk ``sub``), never by the raw subject.
- ``delete`` removes the stored connection entirely: after a disconnect,
  NeuroDock retains nothing about the user's storage.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable

from neurodock_state.identity import UserKey


@dataclass(frozen=True)
class Connection:
    """One user's BYOS libSQL/Turso connection.

    Immutable: rotating a connection means storing a *new* instance, never
    mutating an existing one (the project's immutability convention).

    ``auth_token`` is ``None`` for token-less endpoints (e.g. a local ``file:``
    database used in tests). For remote ``libsql://`` / ``https://`` endpoints it
    carries the user's secret and must be treated as such by every store.
    """

    url: str
    auth_token: str | None = None


@runtime_checkable
class ByosConnectionStore(Protocol):
    """The contract a per-user BYOS-connection backing must satisfy.

    Implementations isolate connections per :class:`UserKey`: one user can never
    read or clear another user's connection.
    """

    def get(self, user: UserKey) -> Connection | None:
        """Return ``user``'s stored connection, or ``None`` if not connected."""
        ...

    def put(self, user: UserKey, url: str, auth_token: str | None = None) -> None:
        """Store (replacing any existing) ``user``'s connection."""
        ...

    def delete(self, user: UserKey) -> None:
        """Remove ``user``'s stored connection. Idempotent: a no-op if absent."""
        ...


class InMemoryByosConnectionStore:
    """Dict-backed reference :class:`ByosConnectionStore`. Per-user, no persistence.

    Used by the test-suite to prove the BYOS routing/isolation logic without a
    real Clerk account. Connections are keyed by :attr:`UserKey.storage_key`, so
    two distinct users are isolated and two :class:`UserKey` objects with the
    same ``sub`` collapse to one tenant.
    """

    def __init__(self) -> None:
        self._connections: dict[str, Connection] = {}

    def get(self, user: UserKey) -> Connection | None:
        return self._connections.get(user.storage_key)

    def put(self, user: UserKey, url: str, auth_token: str | None = None) -> None:
        self._connections[user.storage_key] = Connection(url=url, auth_token=auth_token)

    def delete(self, user: UserKey) -> None:
        self._connections.pop(user.storage_key, None)

    def __len__(self) -> int:
        """Number of stored connections. Lets tests assert "nothing was stored"."""
        return len(self._connections)
