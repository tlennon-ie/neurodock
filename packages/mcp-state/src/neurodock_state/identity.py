# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Per-user identity derived from the validated FastMCP access token.

A :class:`UserKey` is the opaque, per-user handle that every backing store is
keyed by. It is built from the authenticated user's subject (the Clerk token
``sub``, per ADR 0010 §3), but the raw subject is **never** used directly as a
storage key — :attr:`UserKey.storage_key` returns its SHA-256 digest so a leaked
key reveals nothing about the underlying identity.

``user_key_from_context()`` reads the access token from the active FastMCP
request. The import and use of FastMCP's ``get_access_token`` are wrapped
defensively so that importing this module never fails outside a request context
(e.g. at tool-registration time, in the local stdio path, or in unit tests).
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:  # pragma: no cover - typing only
    from collections.abc import Callable

# Resolve FastMCP's request-scoped access-token accessor at import time, but
# defensively: if FastMCP is unavailable for any reason, fall back to a stub
# that behaves exactly like "no token". Importing this module must never raise.
_get_access_token: Callable[[], Any] | None
try:
    from fastmcp.server.dependencies import get_access_token as _get_access_token
except Exception:  # pragma: no cover - exercised only without fastmcp installed
    _get_access_token = None


@dataclass(frozen=True)
class UserKey:
    """An authenticated user's stable identity within NeuroDock state.

    ``sub`` is the verified token subject (Clerk ``sub``). Treat it as
    sensitive: persist and index on :attr:`storage_key`, not on ``sub`` itself.
    """

    sub: str

    @property
    def storage_key(self) -> str:
        """A stable, opaque key safe to use for storage partitioning.

        Returns the SHA-256 hex digest of :attr:`sub`. Two :class:`UserKey`
        instances with the same ``sub`` produce the same ``storage_key``;
        distinct subjects produce distinct keys with overwhelming probability.
        """
        return hashlib.sha256(self.sub.encode("utf-8")).hexdigest()


def user_key_from_context() -> UserKey | None:
    """Return the current request's :class:`UserKey`, or ``None``.

    Reads the validated access token from the active FastMCP request and
    derives a :class:`UserKey` from its ``sub`` claim. Returns ``None`` when:

    - FastMCP is not importable;
    - there is no active request / no authenticated token; or
    - the token carries no usable ``sub`` claim.

    Never raises: unauthenticated and out-of-request callers simply get
    ``None``, which the caller maps to the stateless / local surface.
    """
    if _get_access_token is None:
        return None

    try:
        token = _get_access_token()
    except Exception:
        # No active request context (e.g. local stdio, registration, tests).
        return None

    if token is None:
        return None

    claims = getattr(token, "claims", None)
    if not isinstance(claims, dict):
        return None

    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        return None

    return UserKey(sub=sub)
