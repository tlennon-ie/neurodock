# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Turso Platform API client for hosted per-user storage (ADR 0010 Phase C).

The hosted storage mode provisions a **NeuroDock-managed Turso database per
user**. This module is the thin seam over the Turso Platform API that does it:
create a database, mint a DB auth token, and destroy a database.

Design
------
- :class:`TursoPlatformClient` is a :class:`~typing.Protocol` declaring the three
  operations the hosted resolver needs. The resolver depends on the protocol, so
  the test-suite injects a fake (no network, no real Turso) and production wires
  the real :class:`HttpxTursoPlatformClient`.
- :class:`HttpxTursoPlatformClient` is a small typed ``httpx`` client. ``httpx``
  is imported **lazily** in the constructor so importing this module never
  requires it; the hosted image installs it. We deliberately do *not* depend on a
  third-party Turso SDK: the Platform surface we use is three endpoints, and a
  hand-rolled typed client keeps the dependency footprint and the failure modes
  fully under our control.

Endpoints (https://api.turso.tech, Bearer ``platform_token``):
- create   : ``POST   /v1/organizations/{org}/databases``           {name, group}
- token    : ``POST   /v1/organizations/{org}/databases/{name}/auth/tokens``
- destroy  : ``DELETE /v1/organizations/{org}/databases/{name}``

Security
--------
- The **platform token** (``NEURODOCK_TURSO_PLATFORM_TOKEN``) is an
  organisation-wide secret that can create and destroy databases. It is held only
  in the hosted process environment and never persisted or logged.
- The **per-database token** minted by :meth:`create_token` is the user's own DB
  credential. The resolver encrypts it at rest (see
  :mod:`neurodock_state.crypto`) before it is stored in Clerk metadata.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Protocol, runtime_checkable

if TYPE_CHECKING:  # pragma: no cover - typing only
    import httpx

_API_BASE = "https://api.turso.tech"
_DEFAULT_TIMEOUT = 30.0


class TursoPlatformError(RuntimeError):
    """A Turso Platform API call failed (network, auth, or unexpected shape).

    Carries the HTTP ``status`` when one is available so callers can branch on
    "already exists" (409) versus "not found" (404) versus everything else.
    """

    def __init__(self, message: str, *, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class DatabaseInfo:
    """The provisioning result for one user's hosted database.

    ``name`` is the Turso database name (deterministic per user); ``hostname`` is
    the libSQL host. :attr:`url` is the ``libsql://`` connection URL the
    cognitive-graph store opens.
    """

    name: str
    hostname: str

    @property
    def url(self) -> str:
        return f"libsql://{self.hostname}"


@runtime_checkable
class TursoPlatformClient(Protocol):
    """The Platform operations the hosted resolver needs. Inject a fake in tests."""

    def create_database(self, name: str, group: str) -> DatabaseInfo:
        """Create database ``name`` in ``group``. Idempotent at the resolver layer.

        Implementations MUST treat an "already exists" (HTTP 409) response as a
        success and return the existing database's :class:`DatabaseInfo`, so a
        repeated provision call is a no-op rather than an error.
        """
        ...

    def create_token(self, name: str) -> str:
        """Mint and return a full-access auth token (JWT) for database ``name``."""
        ...

    def destroy_database(self, name: str) -> None:
        """Permanently delete database ``name``. A missing DB (404) is a no-op."""
        ...


class HttpxTursoPlatformClient:
    """Typed ``httpx`` implementation of :class:`TursoPlatformClient`.

    Construct with the operator's organisation slug and platform token (both from
    the hosted environment). ``httpx`` is imported lazily so the base package
    never requires it.
    """

    def __init__(
        self,
        *,
        organization: str,
        platform_token: str,
        api_base: str = _API_BASE,
        timeout: float = _DEFAULT_TIMEOUT,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        org = organization.strip()
        token = platform_token.strip()
        if not org:
            raise TursoPlatformError("a Turso organization slug is required")
        if not token:
            raise TursoPlatformError("a Turso platform API token is required")
        self._org = org
        self._api_base = api_base.rstrip("/")
        self._timeout = timeout
        # Lazy import: the hosted image installs httpx; the base package does not.
        import httpx

        # ``transport`` lets tests inject an ``httpx.MockTransport`` so the client's
        # own request shaping/parsing is exercised without any network.
        self._client: httpx.Client = httpx.Client(
            base_url=self._api_base,
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
            transport=transport,
        )

    # -- TursoPlatformClient ---------------------------------------------

    def create_database(self, name: str, group: str) -> DatabaseInfo:
        response = self._client.post(
            f"/v1/organizations/{self._org}/databases",
            json={"name": name, "group": group},
        )
        if response.status_code == 409:
            # Already exists — the resolver's idempotent path. Resolve its host
            # from the org/name convention rather than failing.
            return DatabaseInfo(name=name, hostname=self._default_hostname(name))
        body = self._json_or_raise(response, "create database")
        database = body.get("database")
        if not isinstance(database, dict):
            raise TursoPlatformError("create-database response missing 'database' object")
        hostname = database.get("Hostname") or database.get("hostname")
        if not isinstance(hostname, str) or not hostname:
            # Some API responses omit a usable hostname; fall back to convention.
            hostname = self._default_hostname(name)
        return DatabaseInfo(name=name, hostname=hostname)

    def create_token(self, name: str) -> str:
        response = self._client.post(
            f"/v1/organizations/{self._org}/databases/{name}/auth/tokens",
        )
        body = self._json_or_raise(response, "create database token")
        jwt = body.get("jwt")
        if not isinstance(jwt, str) or not jwt:
            raise TursoPlatformError("create-token response missing 'jwt'")
        return jwt

    def destroy_database(self, name: str) -> None:
        response = self._client.delete(
            f"/v1/organizations/{self._org}/databases/{name}",
        )
        if response.status_code == 404:
            # Already gone — erase is idempotent.
            return
        self._json_or_raise(response, "destroy database")

    def close(self) -> None:
        self._client.close()

    # -- helpers ----------------------------------------------------------

    def _default_hostname(self, name: str) -> str:
        """The conventional Turso libSQL host for ``name`` in this org."""
        return f"{name}-{self._org}.turso.io"

    def _json_or_raise(self, response: httpx.Response, what: str) -> dict[str, Any]:
        if response.status_code >= 400:
            raise TursoPlatformError(
                f"Turso {what} failed: HTTP {response.status_code} {response.text[:200]}",
                status=response.status_code,
            )
        try:
            parsed: dict[str, Any] = response.json()
        except ValueError as exc:
            raise TursoPlatformError(f"Turso {what} returned non-JSON body") from exc
        return parsed
