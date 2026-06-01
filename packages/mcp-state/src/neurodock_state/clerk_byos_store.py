# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Clerk-metadata-backed BYOS connection store (ADR 0010 Phase D).

Persists a user's BYOS connection (libSQL URL + encrypted auth token) in their
Clerk ``private_metadata`` via the Clerk Backend API. This is the production
backing for :class:`~neurodock_state.byos_connection_store.ByosConnectionStore`
on the hosted server.

Why Clerk metadata?
-------------------
The hosted container is stateless by design (ADR 0008/0009): it must persist
*nothing* about a user locally. Clerk is already the identity provider and the
user is already authenticated, so their ``private_metadata`` is the natural —
and only — place to keep the single pointer to *their own* database. The graph
data never touches NeuroDock; only this pointer does, and the token half of it
is encrypted at rest.

Secrets
-------
- ``NEURODOCK_CLERK_SECRET_KEY`` — the Clerk Backend API secret key. Required to
  read/write a user's metadata. Without it this store cannot operate and raises
  :class:`ByosStoreConfigError` at construction.
- ``NEURODOCK_STATE_MASTER_KEY`` — the master key used to encrypt the auth token
  before it is written to Clerk metadata (and to decrypt it on read). Required.

Both the Clerk SDK and the ``cryptography`` package are imported **lazily** so
importing this module never fails on a host that lacks them (e.g. the local
stdio install, or unit tests that only exercise the in-memory store).
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from neurodock_state.byos_connection_store import Connection
from neurodock_state.crypto import MasterKeyError, TokenCipher
from neurodock_state.identity import UserKey

# The single key under which the BYOS connection lives in a user's Clerk
# private_metadata. Namespaced so it never collides with other app metadata.
_METADATA_KEY = "neurodock_byos"

_CLERK_SECRET_ENV = "NEURODOCK_CLERK_SECRET_KEY"
_MASTER_KEY_ENV = "NEURODOCK_STATE_MASTER_KEY"


class ByosStoreConfigError(RuntimeError):
    """Required configuration (a secret) is missing or unusable."""


class ByosStoreBackendError(RuntimeError):
    """The Clerk Backend API call failed (network, auth, or unexpected shape)."""


class ClerkMetadataByosStore:
    """Store BYOS connections in Clerk ``private_metadata``, token encrypted.

    Construct with the process environment (or any mapping). Both required
    secrets are read at construction so misconfiguration fails loudly and early
    rather than on the first user call.
    """

    def __init__(self, env: Mapping[str, str]) -> None:
        secret = env.get(_CLERK_SECRET_ENV, "").strip()
        if not secret:
            raise ByosStoreConfigError(
                f"{_CLERK_SECRET_ENV} is required for the Clerk-backed BYOS store"
            )
        master = env.get(_MASTER_KEY_ENV, "").strip()
        if not master:
            raise ByosStoreConfigError(
                f"{_MASTER_KEY_ENV} is required to encrypt BYOS auth tokens at rest"
            )
        self._secret_key = secret
        # Build the cipher eagerly so a broken `cryptography` install fails at
        # construction, not mid-request. (Lazy import keeps module import safe.)
        # The cipher derivation is shared with the hosted Turso token store via
        # `neurodock_state.crypto`, so on-disk Phase D tokens decrypt unchanged.
        self._cipher = TokenCipher(master)
        self._client: Any | None = None

    # -- Clerk client (lazy) ---------------------------------------------

    def _clerk(self) -> Any:
        """Return a cached Clerk Backend client, importing the SDK lazily."""
        if self._client is not None:
            return self._client
        try:
            from clerk_backend_api import Clerk
        except ImportError as exc:  # pragma: no cover - exercised only without SDK
            raise ByosStoreConfigError(
                "The 'clerk-backend-api' package is required for ClerkMetadataByosStore. "
                "Install it in the hosted image (it is a dependency of neurodock-remote)."
            ) from exc
        self._client = Clerk(bearer_auth=self._secret_key)
        return self._client

    # -- token encryption ------------------------------------------------

    def _encrypt(self, token: str) -> str:
        return self._cipher.encrypt(token)

    def _decrypt(self, blob: str) -> str:
        try:
            return self._cipher.decrypt(blob)
        except MasterKeyError as exc:
            raise ByosStoreBackendError(
                f"stored BYOS auth token could not be decrypted (wrong {_MASTER_KEY_ENV}?)"
            ) from exc

    # -- ByosConnectionStore ---------------------------------------------

    def get(self, user: UserKey) -> Connection | None:
        clerk = self._clerk()
        try:
            clerk_user = clerk.users.get(user_id=user.sub)
        except Exception as exc:  # surface as a structured backend error
            raise ByosStoreBackendError(f"Clerk get-user failed: {exc}") from exc

        metadata = getattr(clerk_user, "private_metadata", None) or {}
        record = metadata.get(_METADATA_KEY)
        if not isinstance(record, dict):
            return None

        url = record.get("url")
        if not isinstance(url, str) or not url:
            return None

        token_blob = record.get("auth_token")
        auth_token = (
            self._decrypt(token_blob) if isinstance(token_blob, str) and token_blob else None
        )
        return Connection(url=url, auth_token=auth_token)

    def put(self, user: UserKey, url: str, auth_token: str | None = None) -> None:
        clerk = self._clerk()
        record: dict[str, Any] = {"url": url}
        if auth_token:
            record["auth_token"] = self._encrypt(auth_token)
        try:
            clerk.users.update_metadata(
                user_id=user.sub,
                private_metadata={_METADATA_KEY: record},
            )
        except Exception as exc:  # surface as a structured backend error
            raise ByosStoreBackendError(f"Clerk update-metadata failed: {exc}") from exc

    def delete(self, user: UserKey) -> None:
        clerk = self._clerk()
        # Setting the namespaced key to None clears it from private_metadata
        # (Clerk merges metadata and drops null-valued keys). NeuroDock then
        # retains nothing about the user's storage.
        try:
            clerk.users.update_metadata(
                user_id=user.sub,
                private_metadata={_METADATA_KEY: None},
            )
        except Exception as exc:  # surface as a structured backend error
            raise ByosStoreBackendError(f"Clerk clear-metadata failed: {exc}") from exc
