# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Storage-admin tools for the hosted server (ADR 0010 Phases C + D).

An authenticated user manages their own storage through these tools. Two modes
coexist; a user is in exactly one at a time, recorded in their storage preference:

- ``enable_hosted_storage()`` (Phase C) — capture explicit consent, set
  mode="hosted", and have NeuroDock provision a private Turso database for the
  user. Returns the disclosure text. Idempotent: re-enabling reuses the database.
- ``connect_byos_storage(libsql_url, auth_token=None)`` (Phase D) — validate the
  URL, smoke-test a connect+migrate, persist the connection, and set mode="byos".
  Only a database that actually accepts the schema is ever stored.
- ``disable_and_erase_storage()`` — hosted → destroy the user's Turso database;
  byos → clear the stored connection. Either way the storage preference/consent
  is cleared, so NeuroDock retains nothing.
- ``disconnect_storage()`` — alias kept for Phase D compatibility: clears the
  BYOS connection and preference (does NOT destroy a hosted DB; that is
  ``disable_and_erase_storage``).
- ``storage_status()`` — report the caller's mode (hosted | byos | none) and
  whether storage is enabled.

All require an authenticated user. An anonymous caller receives the structured
``STORAGE_NOT_AVAILABLE`` refusal and nothing is stored, read, or provisioned.

URL validation (BYOS)
---------------------
Only ``libsql://``, ``https://``, and ``file:`` URLs are accepted. ``file:`` is
allowed for self-hosted / embedded single-user deployments and for tests.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from neurodock_state.storage_preference_store import StoragePreference

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
HOSTED_UNAVAILABLE = "HOSTED_STORAGE_UNAVAILABLE"
PROVISION_FAILED = "HOSTED_PROVISION_FAILED"

# The consent disclosure surfaced when a user enables hosted storage. Keep in
# step with HostedTursoResolver.CONSENT_VERSION when the wording materially
# changes.
_HOSTED_DISCLOSURE = (
    "You are enabling NeuroDock-hosted storage. NeuroDock will provision a "
    "private database (isolated to your account) and store your cognitive-graph "
    "facts there. The database auth token is encrypted at rest. Your data is "
    "never aggregated with other users' and never used for analytics. You can "
    "erase everything at any time with disable_and_erase_storage, which destroys "
    "the database and clears your stored preference. For maximum privacy, prefer "
    "connect_byos_storage (your own database) or the local install instead."
)


def _validate_url(libsql_url: Any) -> str:
    """Return a trimmed, scheme-checked URL or raise a structured error payload."""
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
    """Bad tool input / operation failure. Converted to a payload by the wrapper."""

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
    """Register the storage-admin tools on the combined server."""

    @mcp.tool(
        name="enable_hosted_storage",
        description=(
            "Enable NeuroDock-hosted storage: NeuroDock provisions a private "
            "database (isolated to your account) and the memory tools store data "
            "there. Records your explicit consent and returns a disclosure of what "
            "is stored and how to erase it. Requires a signed-in NeuroDock account. "
            "For maximum privacy use connect_byos_storage (your own database) instead."
        ),
    )
    def enable_hosted_storage() -> dict[str, Any]:
        try:
            user = state.require_user()
            if not state.hosted_available:
                raise _ToolInputError(
                    HOSTED_UNAVAILABLE,
                    "Hosted storage is not configured on this server. Use "
                    "connect_byos_storage with your own database instead.",
                )
            try:
                database = state.hosted.provision(user)
            except Exception as exc:  # provisioning failure → structured payload
                _LOG.exception("enable_hosted_storage provisioning failed")
                raise _ToolInputError(
                    PROVISION_FAILED,
                    f"could not provision your hosted database: {exc}",
                ) from exc
        except StorageUnavailableError as exc:
            return exc.to_payload()
        except _ToolInputError as exc:
            return exc.to_payload()
        return {
            "status": "enabled",
            "mode": "hosted",
            "database": database.name,
            "disclosure": _HOSTED_DISCLOSURE,
            "message": (
                "Hosted storage enabled. Your memory tools now read and write a "
                "private NeuroDock-managed database isolated to your account. "
                "Run disable_and_erase_storage at any time to destroy it."
            ),
        }

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
            # Record the active mode so the combined resolver routes to BYOS.
            state.preferences.put(user, StoragePreference(mode="byos"))
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
        name="disable_and_erase_storage",
        description=(
            "Disable storage and erase it. Hosted: destroys the NeuroDock-managed "
            "database NeuroDock provisioned for you. BYOS: clears the stored "
            "connection (your own database is left untouched). Either way your "
            "stored preference and consent are cleared. Requires a signed-in account."
        ),
    )
    def disable_and_erase_storage() -> dict[str, Any]:
        try:
            user = state.require_user()
            preference = state.preferences.get(user)
            mode = preference.mode if preference is not None else "none"
            if mode == "hosted":
                try:
                    state.hosted.erase(user)  # destroys the DB + clears preference
                except Exception as exc:
                    _LOG.exception("disable_and_erase_storage hosted erase failed")
                    raise _ToolInputError(
                        PROVISION_FAILED,
                        f"could not destroy your hosted database: {exc}",
                    ) from exc
            else:
                # BYOS or none: clear the connection (no-op if absent) and the
                # preference. The user's own database is never touched.
                state.connections.delete(user)
                state.preferences.clear(user)
        except StorageUnavailableError as exc:
            return exc.to_payload()
        except _ToolInputError as exc:
            return exc.to_payload()
        return {
            "status": "erased",
            "mode": "none",
            "message": (
                "Storage disabled and erased. NeuroDock now retains nothing about your storage."
            ),
        }

    @mcp.tool(
        name="disconnect_storage",
        description=(
            "Disconnect your BYOS storage database. NeuroDock deletes the connection "
            "and retains nothing about your storage. Your data stays in your own "
            "database, untouched. (To erase NeuroDock-hosted storage instead, use "
            "disable_and_erase_storage.) Requires a signed-in NeuroDock account."
        ),
    )
    def disconnect_storage() -> dict[str, Any]:
        try:
            user = state.require_user()
            state.connections.delete(user)
            state.preferences.clear(user)
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
            "Report whether you are signed in and which storage mode is active "
            "(mode: hosted, byos, or none)."
        ),
    )
    def storage_status() -> dict[str, Any]:
        status = state.status()
        return {
            "authenticated": status.authenticated,
            "mode": status.mode,
            "connected": status.connected,
        }
