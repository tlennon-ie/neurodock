# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Storage-admin tools for the hosted server (ADR 0010 Phase D).

Three tools let an authenticated user manage their own BYOS connection:

- ``connect_byos_storage(libsql_url, auth_token=None)`` — validate the URL,
  smoke-test a connect+migrate against it, then persist the connection. Only a
  database that actually accepts the schema is ever stored, so a user can never
  end up with a "connected" pointer to a broken endpoint.
- ``disconnect_storage()`` — delete the stored connection. NeuroDock then
  retains nothing about the user's storage.
- ``storage_status()`` — report the caller's mode and whether they are connected.

All three require an authenticated user. An anonymous caller receives the
structured ``STORAGE_NOT_AVAILABLE`` refusal and nothing is stored or read.

URL validation
--------------
Only ``libsql://``, ``https://``, and ``file:`` URLs are accepted. ``file:`` is
allowed for self-hosted / embedded single-user deployments and for tests; the
hosted multi-tenant deployment will in practice receive ``libsql://`` Turso URLs.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from neurodock_remote.state import ByosState, StorageUnavailableError

if TYPE_CHECKING:  # pragma: no cover - typing only
    from fastmcp import FastMCP

_LOG = logging.getLogger("neurodock_remote.tools.storage_admin")

# Accepted libSQL connection-URL schemes. `libsql://`/`https://` are remote
# (Turso et al.); `file:` is local/embedded. Anything else is rejected before we
# even attempt a connection.
_ALLOWED_SCHEMES = ("libsql://", "https://", "file:")

INVALID_URL = "INVALID_STORAGE_URL"
CONNECT_FAILED = "STORAGE_CONNECT_FAILED"


def _validate_url(libsql_url: Any) -> str:
    """Return a trimmed, scheme-checked URL or raise a structured error payload.

    Raises:
        StorageUnavailableError: never (auth is checked by the caller).
    """
    if not isinstance(libsql_url, str) or not libsql_url.strip():
        raise _ToolInputError(
            INVALID_URL,
            "libsql_url is required and must be a non-empty string.",
        )
    url = libsql_url.strip()
    if not url.startswith(_ALLOWED_SCHEMES):
        raise _ToolInputError(
            INVALID_URL,
            "libsql_url must start with one of: "
            f"{', '.join(_ALLOWED_SCHEMES)} (got {url.split(':', 1)[0]!r}).",
        )
    return url


class _ToolInputError(Exception):
    """Bad tool input. Converted to a structured payload by the tool wrapper."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message

    def to_payload(self) -> dict[str, str]:
        return {"error": self.code, "message": self.message}


def _smoke_test_connection(url: str, auth_token: str | None) -> None:
    """Connect to the candidate DB and apply migrations, then close it.

    Proves the connection is usable BEFORE it is persisted. Raises
    :class:`_ToolInputError` with ``STORAGE_CONNECT_FAILED`` on any failure so the
    user gets an actionable message rather than a later mid-tool crash.
    """
    from neurodock_mcp_cognitive_graph.storage.libsql import LibSqlStorage

    store = LibSqlStorage(url, auth_token=auth_token)
    try:
        store.initialise()
    except Exception as exc:  # report any backend failure structurally
        raise _ToolInputError(
            CONNECT_FAILED,
            f"could not connect to or migrate the database: {exc}",
        ) from exc
    finally:
        try:
            store.close()
        except Exception:  # close failures must not mask the result
            _LOG.warning("storage smoke-test close failed", exc_info=True)


def register_storage_admin_tools(mcp: FastMCP[Any], state: ByosState) -> None:
    """Register connect / disconnect / status on the combined server."""

    @mcp.tool(
        name="connect_byos_storage",
        description=(
            "Connect your own libSQL/Turso database so the NeuroDock memory tools "
            "store data in YOUR database, not on NeuroDock. Validates the URL and "
            "smoke-tests the connection before saving it. Requires a signed-in "
            "NeuroDock account."
        ),
    )
    def connect_byos_storage(libsql_url: str, auth_token: str | None = None) -> dict[str, Any]:
        try:
            user = state.require_user()
            url = _validate_url(libsql_url)
            token = (
                auth_token.strip() if isinstance(auth_token, str) and auth_token.strip() else None
            )
            _smoke_test_connection(url, token)
            state.connections.put(user, url, token)
        except StorageUnavailableError as exc:
            return exc.to_payload()
        except _ToolInputError as exc:
            return exc.to_payload()
        return {
            "status": "connected",
            "mode": "byos",
            "message": (
                "Storage connected. Your memory tools now read and write your own "
                "database. NeuroDock stores nothing beyond this connection pointer."
            ),
        }

    @mcp.tool(
        name="disconnect_storage",
        description=(
            "Disconnect your storage database. NeuroDock deletes the connection and "
            "retains nothing about your storage. Your data stays in your own database, "
            "untouched. Requires a signed-in NeuroDock account."
        ),
    )
    def disconnect_storage() -> dict[str, Any]:
        try:
            user = state.require_user()
            state.connections.delete(user)
        except StorageUnavailableError as exc:
            return exc.to_payload()
        return {
            "status": "disconnected",
            "mode": "none",
            "message": (
                "Storage disconnected. NeuroDock now retains nothing about your "
                "storage. Your data remains in your own database."
            ),
        }

    @mcp.tool(
        name="storage_status",
        description=(
            "Report whether you are signed in and whether a storage database is "
            "connected (mode: byos or none)."
        ),
    )
    def storage_status() -> dict[str, Any]:
        status = state.status()
        return {
            "authenticated": status.authenticated,
            "mode": status.mode,
            "connected": status.connected,
        }
