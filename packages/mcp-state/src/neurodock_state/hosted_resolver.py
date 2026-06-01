# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Hosted per-user backing resolver (ADR 0010 Phase C).

:class:`HostedTursoResolver` is the :class:`~neurodock_state.registry.StateBackingResolver`
for the **NeuroDock-provisioned** storage path. Where the Phase D
:class:`~neurodock_state.byos_resolver.ByosResolver` points at the user's *own*
database, this resolver provisions and owns a Turso database **per user** and
returns a cognitive-graph store pointed at it.

Responsibilities
----------------
- :meth:`storage_mode` — ``"hosted"`` when the user has a recorded preference with
  ``mode == "hosted"``, else ``"none"``. The ``"none"`` default is the security
  posture: a user who has not consented to hosted storage gets no storage, and the
  un-gating layer turns that into the "enable storage first" refusal without ever
  provisioning or touching a database.
- :meth:`provision` — idempotently create the user's Turso database (create-if-
  absent), mint a DB token, and persist the pointer (token encrypted at rest) in
  the preference record with ``mode == "hosted"`` and the captured consent. Safe
  to call twice: the second call reuses the existing database.
- :meth:`graph_store` — return a :class:`LibSqlStorage` over the user's hosted DB.
  If the database has not been provisioned yet it provisions on demand (so the
  first graph call after consent just works).
- :meth:`erase` — destroy the user's Turso database and clear their preference
  record, so NeuroDock retains nothing after erasure.

Injection
---------
The Turso :class:`~neurodock_state.turso_platform.TursoPlatformClient` and the
:class:`~neurodock_state.storage_preference_store.StoragePreferenceStore` are both
injected, so the test-suite drives the whole flow with a fake platform client
(pointed at a local ``file:`` libSQL DB) and an in-memory preference store — no
real Turso, no real Clerk.

The cognitive-graph package is imported **lazily** inside :meth:`graph_store` so
:mod:`neurodock_state` stays importable without it.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import TYPE_CHECKING, cast

from neurodock_state.identity import UserKey
from neurodock_state.registry import GraphStore, StorageMode
from neurodock_state.storage_preference_store import (
    HostedDatabase,
    StoragePreference,
    StoragePreferenceStore,
)
from neurodock_state.turso_platform import TursoPlatformClient

if TYPE_CHECKING:  # pragma: no cover - typing only
    from neurodock_state.profile_store import ProfileStore
    from neurodock_state.session_store import SessionStore

# The disclosure version the consent step records. Bump when the disclosure text
# materially changes so audit can tell which version a user agreed to.
CONSENT_VERSION = "2026-06-01"

# Turso database names allow lowercase letters, digits, and dashes (<= 64 chars).
# We derive a deterministic, opaque name from the user's storage_key so the same
# user always maps to the same database (idempotent provisioning) and the name
# leaks nothing about the underlying identity.
_DB_NAME_PREFIX = "nd-"
_DB_NAME_HASH_LEN = 32  # 32 hex chars + 3-char prefix = 35, well under 64.

_SESSION_PROFILE_DEFERRED = (
    "Hosted session/profile persistence is out of scope for ADR 0010 Phase C; "
    "only the four cognitive-graph tools are un-gated. This is a tracked follow-up."
)


def _database_name(user: UserKey) -> str:
    """Deterministic, opaque Turso DB name for ``user``.

    A second SHA-256 over the already-hashed storage_key keeps the database name
    decoupled from any other surface that might index on storage_key directly.
    """
    digest = hashlib.sha256(user.storage_key.encode("utf-8")).hexdigest()
    return f"{_DB_NAME_PREFIX}{digest[:_DB_NAME_HASH_LEN]}"


class HostedTursoResolver:
    """Resolve per-user cognitive-graph backings from NeuroDock-provisioned Turso DBs.

    Stateless apart from the injected platform client and preference store: every
    resolution reads the user's preference fresh, so an erase takes effect on the
    very next call.
    """

    def __init__(
        self,
        *,
        platform: TursoPlatformClient,
        preferences: StoragePreferenceStore,
        group: str,
    ) -> None:
        self._platform = platform
        self._preferences = preferences
        self._group = group

    # -- StateBackingResolver --------------------------------------------

    def storage_mode(self, user: UserKey) -> StorageMode:
        preference = self._preferences.get(user)
        if preference is not None and preference.mode == "hosted":
            return "hosted"
        return "none"

    def graph_store(self, user: UserKey) -> GraphStore:
        database = self._ensure_database(user)
        return self._open(database)

    def session_store(self, user: UserKey) -> SessionStore:
        raise NotImplementedError(_SESSION_PROFILE_DEFERRED)

    def profile_store(self, user: UserKey) -> ProfileStore:
        raise NotImplementedError(_SESSION_PROFILE_DEFERRED)

    # -- lifecycle (hosted-specific) -------------------------------------

    def provision(self, user: UserKey, *, now: datetime | None = None) -> HostedDatabase:
        """Idempotently provision ``user``'s hosted DB and record consent.

        Creates the Turso database if absent, mints a DB token, and writes the
        preference record (``mode == "hosted"``, token encrypted at rest by the
        preference store) with the consent timestamp/version. Returns the
        :class:`HostedDatabase`. Calling twice reuses the existing database and
        refreshes nothing destructive — the existing pointer is kept.
        """
        existing = self._preferences.get(user)
        if existing is not None and existing.mode == "hosted" and existing.database is not None:
            # Already provisioned: idempotent no-op, return the existing pointer.
            return existing.database

        database = self._create_database(user)
        consent_at = (now or datetime.now(UTC)).isoformat()
        preference = StoragePreference(
            mode="hosted",
            consent_at=consent_at,
            consent_version=CONSENT_VERSION,
            database=database,
        )
        self._preferences.put(user, preference)
        return database

    def erase(self, user: UserKey) -> None:
        """Destroy ``user``'s hosted DB and clear their preference record.

        Idempotent: a user with no hosted database simply has their preference
        cleared. After this call NeuroDock retains no token, pointer, or
        preference for the user, and the Turso database is gone.
        """
        preference = self._preferences.get(user)
        if preference is not None and preference.database is not None:
            self._platform.destroy_database(preference.database.name)
        self._preferences.clear(user)

    # -- internals --------------------------------------------------------

    def _ensure_database(self, user: UserKey) -> HostedDatabase:
        """Return the user's hosted DB, provisioning on demand if necessary."""
        preference = self._preferences.get(user)
        if (
            preference is not None
            and preference.mode == "hosted"
            and preference.database is not None
        ):
            return preference.database
        # Consented to hosted but no database yet (or first graph call): provision.
        return self.provision(user)

    def _create_database(self, user: UserKey) -> HostedDatabase:
        name = _database_name(user)
        info = self._platform.create_database(name, self._group)
        token = self._platform.create_token(name)
        return HostedDatabase(name=info.name, url=info.url, token=token)

    def _open(self, database: HostedDatabase) -> GraphStore:
        # Lazy import: keep neurodock_state free of a hard cognitive-graph
        # dependency. The hosted image installs the cognitive-graph package and
        # its `libsql` extra; the resolver only needs them when actually serving.
        from neurodock_mcp_cognitive_graph.storage.libsql import LibSqlStorage

        # LibSqlStorage is a structural superset of GraphStore (initialise/close);
        # the cognitive-graph package ships without py.typed so cast to the
        # declared return type.
        return cast(GraphStore, LibSqlStorage(database.url, auth_token=database.token))
