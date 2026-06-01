# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Per-user storage-preference record (ADR 0010 Phase C).

A *storage preference* captures the decision a user has made about where their
stateful data lives, plus — for the hosted mode — the pointer NeuroDock needs to
reach the database it provisioned for them:

- ``mode``        — ``"hosted"`` | ``"byos"`` | ``"none"`` (the effective mode).
- ``consent_at``  — ISO 8601 timestamp of the explicit opt-in (audit/erasure).
- ``consent_version`` — the disclosure version the user agreed to.
- ``database``    — for hosted only: the provisioned Turso DB name + libSQL URL.
- ``db_token``    — for hosted only: the user's DB auth token, **encrypted at
  rest** with the operator master key (see :mod:`neurodock_state.crypto`).

Why a separate record from the BYOS connection?
-----------------------------------------------
Phase D's :class:`~neurodock_state.byos_connection_store.ByosConnectionStore`
holds the BYOS connection (the user's *own* DB). Phase C adds a hosted DB that
NeuroDock provisions and owns the lifecycle of. The two are different secrets
with different lifecycles, and a user is in exactly one mode at a time. Rather
than overload the BYOS record, the preference record is the single source of
truth for *which* mode is active; the combined resolver reads it to route.

Storage backends
----------------
- :class:`InMemoryStoragePreferenceStore` — dict-backed reference impl for tests.
- :class:`ClerkMetadataPreferenceStore` — persists the record in the user's Clerk
  ``private_metadata`` (namespaced key ``neurodock_storage_pref``), encrypting the
  hosted DB token at rest. Mirrors the Phase D Clerk store: the Clerk SDK is
  imported lazily; the cipher is shared via :mod:`neurodock_state.crypto`.

Privacy
-------
The record is keyed by :attr:`UserKey.storage_key` (the SHA-256 of the Clerk
``sub``) in memory, and by ``sub`` only as the Clerk user id. ``clear`` removes
the record entirely — after erasure NeuroDock retains no preference, no token,
and no pointer for the user.
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Any, Literal, Protocol, runtime_checkable

from neurodock_state.crypto import MasterKeyError, TokenCipher
from neurodock_state.identity import UserKey

PreferenceMode = Literal["hosted", "byos", "none"]

# Namespaced key under which the preference record lives in Clerk private_metadata.
_METADATA_KEY = "neurodock_storage_pref"

_CLERK_SECRET_ENV = "NEURODOCK_CLERK_SECRET_KEY"
_MASTER_KEY_ENV = "NEURODOCK_STATE_MASTER_KEY"


class PreferenceStoreConfigError(RuntimeError):
    """Required configuration (a secret) is missing or unusable."""


class PreferenceStoreBackendError(RuntimeError):
    """The Clerk Backend API call failed (network, auth, or unexpected shape)."""


@dataclass(frozen=True)
class HostedDatabase:
    """The NeuroDock-provisioned Turso database for one hosted user.

    Immutable. ``token`` is the plaintext DB auth token in memory; persistence
    layers encrypt it at rest. ``None`` token is allowed only for token-less
    local ``file:`` databases used in tests.
    """

    name: str
    url: str
    token: str | None = None


@dataclass(frozen=True)
class StoragePreference:
    """One user's recorded storage decision. Immutable: updates return a copy."""

    mode: PreferenceMode
    consent_at: str | None = None
    consent_version: str | None = None
    database: HostedDatabase | None = None


@runtime_checkable
class StoragePreferenceStore(Protocol):
    """The contract a per-user storage-preference backing must satisfy.

    Implementations isolate records per :class:`UserKey`: one user can never read
    or clear another user's preference.
    """

    def get(self, user: UserKey) -> StoragePreference | None:
        """Return ``user``'s recorded preference, or ``None`` if never set."""
        ...

    def put(self, user: UserKey, preference: StoragePreference) -> None:
        """Store (replacing any existing) ``user``'s preference."""
        ...

    def clear(self, user: UserKey) -> None:
        """Remove ``user``'s preference entirely. Idempotent."""
        ...


class InMemoryStoragePreferenceStore:
    """Dict-backed reference :class:`StoragePreferenceStore`. Per-user, no persistence.

    Used by the test-suite to prove the routing/consent/erasure logic without a
    real Clerk account. Records are keyed by :attr:`UserKey.storage_key`.
    """

    def __init__(self) -> None:
        self._records: dict[str, StoragePreference] = {}

    def get(self, user: UserKey) -> StoragePreference | None:
        return self._records.get(user.storage_key)

    def put(self, user: UserKey, preference: StoragePreference) -> None:
        self._records[user.storage_key] = preference

    def clear(self, user: UserKey) -> None:
        self._records.pop(user.storage_key, None)

    def __len__(self) -> int:
        """Number of stored records. Lets tests assert "nothing was stored"."""
        return len(self._records)


class ClerkMetadataPreferenceStore:
    """Store storage preferences in Clerk ``private_metadata``, DB token encrypted.

    Construct with the process environment (or any mapping). Both required secrets
    are read at construction so misconfiguration fails loudly and early.
    """

    def __init__(self, env: Mapping[str, str]) -> None:
        secret = env.get(_CLERK_SECRET_ENV, "").strip()
        if not secret:
            raise PreferenceStoreConfigError(
                f"{_CLERK_SECRET_ENV} is required for the Clerk-backed preference store"
            )
        master = env.get(_MASTER_KEY_ENV, "").strip()
        if not master:
            raise PreferenceStoreConfigError(
                f"{_MASTER_KEY_ENV} is required to encrypt hosted DB tokens at rest"
            )
        self._secret_key = secret
        # Build the cipher eagerly so a broken `cryptography` install fails at
        # construction, not mid-request. Shared derivation with the BYOS store.
        self._cipher = TokenCipher(master)
        self._client: Any | None = None

    # -- Clerk client (lazy) ---------------------------------------------

    def _clerk(self) -> Any:
        if self._client is not None:
            return self._client
        try:
            from clerk_backend_api import Clerk
        except ImportError as exc:  # pragma: no cover - exercised only without SDK
            raise PreferenceStoreConfigError(
                "The 'clerk-backend-api' package is required for "
                "ClerkMetadataPreferenceStore. Install it in the hosted image "
                "(it is a dependency of neurodock-remote)."
            ) from exc
        self._client = Clerk(bearer_auth=self._secret_key)
        return self._client

    # -- serialisation ----------------------------------------------------

    def _to_record(self, preference: StoragePreference) -> dict[str, Any]:
        record: dict[str, Any] = {"mode": preference.mode}
        if preference.consent_at is not None:
            record["consent_at"] = preference.consent_at
        if preference.consent_version is not None:
            record["consent_version"] = preference.consent_version
        if preference.database is not None:
            db: dict[str, Any] = {
                "name": preference.database.name,
                "url": preference.database.url,
            }
            if preference.database.token:
                db["token"] = self._cipher.encrypt(preference.database.token)
            record["database"] = db
        return record

    def _from_record(self, record: Mapping[str, Any]) -> StoragePreference | None:
        mode = record.get("mode")
        if mode not in ("hosted", "byos", "none"):
            return None
        database: HostedDatabase | None = None
        raw_db = record.get("database")
        if isinstance(raw_db, dict):
            name = raw_db.get("name")
            url = raw_db.get("url")
            if isinstance(name, str) and name and isinstance(url, str) and url:
                token_blob = raw_db.get("token")
                token = (
                    self._decrypt(token_blob)
                    if isinstance(token_blob, str) and token_blob
                    else None
                )
                database = HostedDatabase(name=name, url=url, token=token)
        consent_at = record.get("consent_at")
        consent_version = record.get("consent_version")
        return StoragePreference(
            mode=mode,
            consent_at=consent_at if isinstance(consent_at, str) else None,
            consent_version=consent_version if isinstance(consent_version, str) else None,
            database=database,
        )

    def _decrypt(self, blob: str) -> str:
        try:
            return self._cipher.decrypt(blob)
        except MasterKeyError as exc:
            raise PreferenceStoreBackendError(
                f"stored hosted DB token could not be decrypted (wrong {_MASTER_KEY_ENV}?)"
            ) from exc

    # -- StoragePreferenceStore ------------------------------------------

    def get(self, user: UserKey) -> StoragePreference | None:
        clerk = self._clerk()
        try:
            clerk_user = clerk.users.get(user_id=user.sub)
        except Exception as exc:  # surface as a structured backend error
            raise PreferenceStoreBackendError(f"Clerk get-user failed: {exc}") from exc

        metadata = getattr(clerk_user, "private_metadata", None) or {}
        record = metadata.get(_METADATA_KEY)
        if not isinstance(record, dict):
            return None
        return self._from_record(record)

    def put(self, user: UserKey, preference: StoragePreference) -> None:
        clerk = self._clerk()
        try:
            clerk.users.update_metadata(
                user_id=user.sub,
                private_metadata={_METADATA_KEY: self._to_record(preference)},
            )
        except Exception as exc:  # surface as a structured backend error
            raise PreferenceStoreBackendError(f"Clerk update-metadata failed: {exc}") from exc

    def clear(self, user: UserKey) -> None:
        clerk = self._clerk()
        # Setting the namespaced key to None clears it (Clerk merges metadata and
        # drops null-valued keys). NeuroDock then retains no preference/token.
        try:
            clerk.users.update_metadata(
                user_id=user.sub,
                private_metadata={_METADATA_KEY: None},
            )
        except Exception as exc:  # surface as a structured backend error
            raise PreferenceStoreBackendError(f"Clerk clear-metadata failed: {exc}") from exc


def with_mode(preference: StoragePreference | None, mode: PreferenceMode) -> StoragePreference:
    """Return a copy of ``preference`` with ``mode`` set, immutably.

    A small convenience for callers updating only the mode (e.g. switching an
    existing record to ``"none"`` on erasure). Starts from a bare record when
    ``preference`` is ``None``.
    """
    if preference is None:
        return StoragePreference(mode=mode)
    return replace(preference, mode=mode)
