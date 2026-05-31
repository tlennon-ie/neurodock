# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Per-user BYOS state wiring for the hosted server (ADR 0010 Phase D).

This module is the bridge between the stateless remote transport and the opt-in
BYOS storage. It owns three concerns:

1. **Construction** of the connection store + resolver from the environment.
   On the hosted path the connection store is the Clerk-metadata-backed store;
   tests inject :class:`InMemoryByosConnectionStore` directly.
2. **The structured errors** returned to anonymous and non-opted-in callers. The
   security boundary lives here: these responses are produced WITHOUT touching
   any store, so a session that has not opted in stores — and reads — nothing.
3. **The store provider** handed to the cognitive-graph ``build_app`` seam. It
   resolves the *caller's own* libSQL store at call time, or raises a structured
   refusal that the tool layer surfaces verbatim.

Error codes (stable; clients may branch on them):

- ``STORAGE_NOT_AVAILABLE`` — no authenticated NeuroDock user. The tool needs an
  account + connected storage.
- ``STORAGE_NOT_CONNECTED`` — authenticated, but no BYOS database connected yet.
  The caller should run ``connect_byos_storage`` first.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING

from neurodock_state.byos_resolver import ByosResolver
from neurodock_state.identity import UserKey, user_key_from_context

if TYPE_CHECKING:  # pragma: no cover - typing only
    from neurodock_state.byos_connection_store import ByosConnectionStore
    from neurodock_state.registry import GraphStore

# -- structured refusals --------------------------------------------------

STORAGE_NOT_AVAILABLE = "STORAGE_NOT_AVAILABLE"
STORAGE_NOT_CONNECTED = "STORAGE_NOT_CONNECTED"

_NOT_AVAILABLE_MESSAGE = (
    "This tool needs a NeuroDock account and connected storage. "
    "Sign in to the hosted server, then connect your own database with "
    "connect_byos_storage. NeuroDock stores nothing for anonymous sessions."
)
_NOT_CONNECTED_MESSAGE = (
    "You are signed in but have not connected a storage database yet. "
    "Call connect_byos_storage with your libSQL/Turso URL (and auth token) to "
    "enable this tool. Your graph data lives in your database, never on NeuroDock."
)


class StorageUnavailableError(Exception):
    """The caller has no NeuroDock account: the stateful tools are not available.

    Carries a stable ``code`` and a caller-facing ``message``. The tool layer
    converts this into a structured payload — it is never a crash, matching the
    project's never-block-silently norm.
    """

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message

    def to_payload(self) -> dict[str, str]:
        return {"error": self.code, "message": self.message}


@dataclass(frozen=True)
class StorageStatus:
    """A read-only view of the caller's storage posture."""

    authenticated: bool
    mode: str  # "byos" | "none"
    connected: bool


# -- the BYOS state container --------------------------------------------


class ByosState:
    """Resolves the caller's BYOS backing and enforces the privacy boundary.

    Holds the connection store and a :class:`ByosResolver` over it. Every method
    derives the caller from the FastMCP request context (the validated token),
    so identity can never be spoofed by a tool argument.
    """

    def __init__(self, connections: ByosConnectionStore) -> None:
        self._connections = connections
        self._resolver = ByosResolver(connections)

    @property
    def connections(self) -> ByosConnectionStore:
        return self._connections

    def require_user(self) -> UserKey:
        """Return the authenticated caller, or raise :class:`StorageUnavailableError`.

        This is the single choke point for "is there a NeuroDock account?". It
        reads the validated access token from the request context and never
        touches a store, so an anonymous caller is refused before any state is
        consulted.
        """
        user = user_key_from_context()
        if user is None:
            raise StorageUnavailableError(STORAGE_NOT_AVAILABLE, _NOT_AVAILABLE_MESSAGE)
        return user

    def status(self) -> StorageStatus:
        """Report the caller's storage posture without mutating anything."""
        user = user_key_from_context()
        if user is None:
            return StorageStatus(authenticated=False, mode="none", connected=False)
        mode = self._resolver.storage_mode(user)
        return StorageStatus(authenticated=True, mode=mode, connected=mode == "byos")

    def graph_store(self) -> GraphStore:
        """Resolve the caller's own cognitive-graph store, or raise a refusal.

        The provider semantics ADR 0010 Phase D requires:

        - no authenticated user → :class:`StorageUnavailableError`
          (``STORAGE_NOT_AVAILABLE``), WITHOUT touching any store;
        - authenticated but not connected → :class:`StorageUnavailableError`
          (``STORAGE_NOT_CONNECTED``);
        - otherwise → the user's libSQL store, freshly resolved and initialised.
        """
        user = self.require_user()
        if self._resolver.storage_mode(user) == "none":
            raise StorageUnavailableError(STORAGE_NOT_CONNECTED, _NOT_CONNECTED_MESSAGE)
        store = self._resolver.graph_store(user)
        # Initialise (idempotent migrations) so the first call against a freshly
        # connected DB just works. Cheap on an already-migrated database.
        store.initialise()
        return store


def build_connection_store(env: Mapping[str, str]) -> ByosConnectionStore | None:
    """Build the production connection store from the environment, or ``None``.

    Returns the Clerk-metadata-backed store when its required secrets are
    present; returns ``None`` (BYOS disabled) when they are not, so a bare local
    run without secrets simply does not offer storage rather than crashing. The
    Clerk SDK and crypto are imported lazily inside the store.
    """
    has_clerk_secret = bool(env.get("NEURODOCK_CLERK_SECRET_KEY", "").strip())
    has_master_key = bool(env.get("NEURODOCK_STATE_MASTER_KEY", "").strip())
    if not (has_clerk_secret and has_master_key):
        return None
    from neurodock_state.clerk_byos_store import ClerkMetadataByosStore

    # ClerkMetadataByosStore structurally satisfies ByosConnectionStore; mypy
    # verifies the protocol conformance on this annotated assignment.
    store: ByosConnectionStore = ClerkMetadataByosStore(env)
    return store
