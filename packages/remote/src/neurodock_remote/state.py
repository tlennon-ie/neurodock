# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Per-user storage wiring for the hosted server (ADR 0010 Phases C + D).

This module is the bridge between the stateless remote transport and the opt-in
storage. Two storage modes coexist behind a single combined resolver:

- **hosted** (Phase C) — a NeuroDock-provisioned Turso database per user; and
- **byos**   (Phase D) — the user's own libSQL/Turso connection.

It owns three concerns:

1. **Construction** of the preference store, BYOS connection store, the Turso
   platform client, and the resolvers from the environment. On the hosted path
   the stores are Clerk-metadata-backed; tests inject in-memory stores and a fake
   platform client directly.
2. **The structured errors** returned to anonymous and non-opted-in callers. The
   security boundary lives here: these responses are produced WITHOUT touching
   any store or provisioning anything, so a session that has not opted in stores
   — and reads — nothing.
3. **The store provider** handed to the cognitive-graph tool seam. It resolves
   the caller's store (hosted OR byos, by their recorded preference) at call
   time, or raises a structured refusal that the tool layer surfaces verbatim.

Error codes (stable; clients may branch on them):

- ``STORAGE_NOT_AVAILABLE`` — no authenticated NeuroDock user. The tool needs an
  account + enabled storage.
- ``STORAGE_NOT_CONNECTED`` — authenticated, but no storage enabled yet. The
  caller should run ``enable_hosted_storage`` or ``connect_byos_storage`` first.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import TYPE_CHECKING

from neurodock_state.byos_resolver import ByosResolver
from neurodock_state.combined_resolver import CombinedResolver
from neurodock_state.hosted_resolver import HostedTursoResolver
from neurodock_state.identity import UserKey, user_key_from_context

if TYPE_CHECKING:  # pragma: no cover - typing only
    from neurodock_state.byos_connection_store import ByosConnectionStore
    from neurodock_state.registry import GraphStore
    from neurodock_state.storage_preference_store import StoragePreferenceStore
    from neurodock_state.turso_platform import TursoPlatformClient

# -- structured refusals --------------------------------------------------

STORAGE_NOT_AVAILABLE = "STORAGE_NOT_AVAILABLE"
STORAGE_NOT_CONNECTED = "STORAGE_NOT_CONNECTED"

_NOT_AVAILABLE_MESSAGE = (
    "This tool needs a NeuroDock account and enabled storage. "
    "Sign in to the hosted server, then enable hosted storage with "
    "enable_hosted_storage, or connect your own database with "
    "connect_byos_storage. NeuroDock stores nothing for anonymous sessions."
)
_NOT_CONNECTED_MESSAGE = (
    "You are signed in but have not enabled storage yet. Call "
    "enable_hosted_storage to let NeuroDock provision a private database for you, "
    "or connect_byos_storage with your own libSQL/Turso URL. Either way your "
    "graph data is isolated to you; anonymous sessions store nothing."
)


class StorageUnavailableError(Exception):
    """The caller cannot use the stateful tools (anonymous, or no storage enabled).

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
    mode: str  # "hosted" | "byos" | "none"
    connected: bool


# -- the storage state container -----------------------------------------


class ByosState:
    """Resolves the caller's storage backing and enforces the privacy boundary.

    Despite the historical name (kept so the Phase D wiring and tests are
    untouched), this now coordinates BOTH storage modes: it holds the preference
    store, the BYOS connection store, an optional hosted Turso resolver, and a
    :class:`CombinedResolver` that routes each call to the user's chosen backing.

    Every method derives the caller from the FastMCP request context (the
    validated token), so identity can never be spoofed by a tool argument.
    """

    def __init__(
        self,
        connections: ByosConnectionStore,
        *,
        preferences: StoragePreferenceStore | None = None,
        platform: TursoPlatformClient | None = None,
        turso_group: str = "default",
    ) -> None:
        from neurodock_state.storage_preference_store import InMemoryStoragePreferenceStore

        self._connections = connections
        # NB: explicit `is None` — an empty in-memory preference store is falsy
        # (its __len__ is 0), so `preferences or ...` would silently drop it.
        self._preferences: StoragePreferenceStore = (
            preferences if preferences is not None else InMemoryStoragePreferenceStore()
        )
        self._byos = ByosResolver(connections)
        # Hosted is only available when a platform client is wired in. When it is
        # absent (no Turso secrets configured) we still build a resolver so the
        # combined router has a target, but provisioning will fail loudly if ever
        # reached — which it cannot be without a recorded hosted preference, and
        # enabling hosted storage is refused up front when the platform is absent.
        self._platform = platform
        self._hosted = HostedTursoResolver(
            platform=platform or _UnavailablePlatform(),
            preferences=self._preferences,
            group=turso_group,
        )
        self._combined = CombinedResolver(
            preferences=self._preferences,
            hosted=self._hosted,
            byos=self._byos,
        )

    # -- accessors used by the admin tools -------------------------------

    @property
    def connections(self) -> ByosConnectionStore:
        return self._connections

    @property
    def preferences(self) -> StoragePreferenceStore:
        return self._preferences

    @property
    def hosted(self) -> HostedTursoResolver:
        return self._hosted

    @property
    def hosted_available(self) -> bool:
        """Whether NeuroDock-hosted provisioning is configured (Turso wired in)."""
        return self._platform is not None

    # -- the choke point --------------------------------------------------

    def require_user(self) -> UserKey:
        """Return the authenticated caller, or raise :class:`StorageUnavailableError`.

        This is the single choke point for "is there a NeuroDock account?". It
        reads the validated access token from the request context and never
        touches a store or provisions anything, so an anonymous caller is refused
        before any state is consulted. UNCHANGED from Phase D.
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
        mode = self._combined.storage_mode(user)
        return StorageStatus(authenticated=True, mode=mode, connected=mode != "none")

    def graph_store(self) -> GraphStore:
        """Resolve the caller's cognitive-graph store, or raise a refusal.

        - no authenticated user → :class:`StorageUnavailableError`
          (``STORAGE_NOT_AVAILABLE``), WITHOUT touching any store or provisioning;
        - authenticated but no storage enabled → :class:`StorageUnavailableError`
          (``STORAGE_NOT_CONNECTED``);
        - otherwise → the user's store (hosted OR byos by their preference),
          freshly resolved and initialised.
        """
        user = self.require_user()
        if self._combined.storage_mode(user) == "none":
            raise StorageUnavailableError(STORAGE_NOT_CONNECTED, _NOT_CONNECTED_MESSAGE)
        store = self._combined.graph_store(user)
        # Initialise (idempotent migrations) so the first call against a freshly
        # enabled DB just works. Cheap on an already-migrated database.
        store.initialise()
        return store


class _UnavailablePlatform:
    """Placeholder :class:`TursoPlatformClient` used when hosting is not configured.

    Any attempt to actually provision/destroy raises, but it can never be reached
    without a recorded hosted preference, and ``enable_hosted_storage`` refuses up
    front when :attr:`ByosState.hosted_available` is false — so this only guards
    the invariant, it is not an expected runtime path.
    """

    def _unavailable(self) -> RuntimeError:
        return RuntimeError(
            "hosted Turso storage is not configured on this server "
            "(set NEURODOCK_TURSO_PLATFORM_TOKEN / _ORG / _GROUP)"
        )

    def create_database(self, name: str, group: str):  # type: ignore[no-untyped-def]
        raise self._unavailable()

    def create_token(self, name: str) -> str:
        raise self._unavailable()

    def destroy_database(self, name: str) -> None:
        raise self._unavailable()


def build_connection_store(env: Mapping[str, str]) -> ByosConnectionStore | None:
    """Build the production BYOS connection store from the environment, or ``None``.

    Returns the Clerk-metadata-backed store when its required secrets are present;
    returns ``None`` (BYOS disabled) when they are not, so a bare local run without
    secrets simply does not offer storage rather than crashing. UNCHANGED from
    Phase D.
    """
    has_clerk_secret = bool(env.get("NEURODOCK_CLERK_SECRET_KEY", "").strip())
    has_master_key = bool(env.get("NEURODOCK_STATE_MASTER_KEY", "").strip())
    if not (has_clerk_secret and has_master_key):
        return None
    from neurodock_state.clerk_byos_store import ClerkMetadataByosStore

    store: ByosConnectionStore = ClerkMetadataByosStore(env)
    return store


def build_preference_store(env: Mapping[str, str]) -> StoragePreferenceStore | None:
    """Build the production storage-preference store from the environment, or ``None``.

    Requires the same two secrets as the BYOS store (Clerk Backend API key +
    master key); returns ``None`` when they are absent. The preference store
    records which mode each user chose and (for hosted) the encrypted DB token.
    """
    has_clerk_secret = bool(env.get("NEURODOCK_CLERK_SECRET_KEY", "").strip())
    has_master_key = bool(env.get("NEURODOCK_STATE_MASTER_KEY", "").strip())
    if not (has_clerk_secret and has_master_key):
        return None
    from neurodock_state.storage_preference_store import ClerkMetadataPreferenceStore

    store: StoragePreferenceStore = ClerkMetadataPreferenceStore(env)
    return store


def build_turso_platform(env: Mapping[str, str]) -> TursoPlatformClient | None:
    """Build the Turso Platform client from the environment, or ``None``.

    Returns a real :class:`HttpxTursoPlatformClient` when the platform token and
    organisation slug are present; returns ``None`` when they are not, so hosted
    provisioning is simply unavailable (``enable_hosted_storage`` refuses) rather
    than crashing. The group defaults to ``"default"`` and can be overridden with
    ``NEURODOCK_TURSO_GROUP``.
    """
    token = env.get("NEURODOCK_TURSO_PLATFORM_TOKEN", "").strip()
    org = env.get("NEURODOCK_TURSO_ORG", "").strip()
    if not (token and org):
        return None
    from neurodock_state.turso_platform import HttpxTursoPlatformClient

    client: TursoPlatformClient = HttpxTursoPlatformClient(
        organization=org,
        platform_token=token,
    )
    return client


def turso_group(env: Mapping[str, str]) -> str:
    """Return the configured Turso group for provisioned databases."""
    return env.get("NEURODOCK_TURSO_GROUP", "").strip() or "default"
