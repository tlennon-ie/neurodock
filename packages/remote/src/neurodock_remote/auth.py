# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Env-driven OAuth resource-server auth for the remote endpoint (ADR 0009 §3).

The identity provider is a *configuration* choice, not a code change. FastMCP 3.x
ships first-class providers (WorkOS AuthKit, Auth0, Clerk, ...) plus a generic JWT
resource-server verifier, so this module simply selects and wires one from the
environment:

    NEURODOCK_AUTH_PROVIDER = none | clerk | workos | jwt   (default: none)

``none`` (the default) returns ``None`` → no auth. This is intended for local and
integration testing bound to localhost ONLY. A public deployment MUST select a
provider; serving the remote endpoint unauthenticated is logged as a loud warning
by the caller.

Provider configuration (read only for the selected provider):

    clerk:  NEURODOCK_CLERK_DOMAIN, NEURODOCK_CLERK_CLIENT_ID,
            NEURODOCK_CLERK_CLIENT_SECRET (optional), NEURODOCK_PUBLIC_URL
    workos: NEURODOCK_AUTHKIT_DOMAIN, NEURODOCK_PUBLIC_URL
    jwt:    NEURODOCK_OAUTH_ISSUER, NEURODOCK_OAUTH_JWKS_URI,
            NEURODOCK_OAUTH_AUDIENCE, NEURODOCK_PUBLIC_URL

    (all):  NEURODOCK_OAUTH_REQUIRED_SCOPES — optional, comma-separated
"""

from __future__ import annotations

import logging
from collections.abc import Mapping

from fastmcp.server.auth import AuthProvider

_LOG = logging.getLogger("neurodock_remote.auth")

_KNOWN_PROVIDERS = ("none", "clerk", "workos", "jwt")


class AuthConfigError(RuntimeError):
    """A provider was selected but its required configuration is missing or invalid."""


def _require(env: Mapping[str, str], key: str) -> str:
    """Return a non-empty env value or raise :class:`AuthConfigError`."""
    value = env.get(key, "").strip()
    if not value:
        raise AuthConfigError(
            f"{key} is required when NEURODOCK_AUTH_PROVIDER selects this provider"
        )
    return value


def _required_scopes(env: Mapping[str, str]) -> list[str] | None:
    raw = env.get("NEURODOCK_OAUTH_REQUIRED_SCOPES", "").strip()
    if not raw:
        return None
    return [scope.strip() for scope in raw.split(",") if scope.strip()]


def build_auth_provider(env: Mapping[str, str]) -> AuthProvider | None:
    """Build the configured auth provider, or ``None`` when auth is disabled.

    Raises:
        AuthConfigError: if a provider is selected but its config is incomplete,
            or if ``NEURODOCK_AUTH_PROVIDER`` names an unknown provider.
    """
    provider = env.get("NEURODOCK_AUTH_PROVIDER", "").strip().lower()

    if provider in ("", "none"):
        _LOG.warning(
            "auth_disabled: NEURODOCK_AUTH_PROVIDER is unset — the endpoint is "
            "UNAUTHENTICATED and must not be exposed publicly (ADR 0009 §3)"
        )
        return None

    if provider == "workos":
        # AuthKitProvider is the WorkOS DCR / RFC 9728 resource-server integration.
        from fastmcp.server.auth.providers.workos import AuthKitProvider

        return AuthKitProvider(
            authkit_domain=_require(env, "NEURODOCK_AUTHKIT_DOMAIN"),
            base_url=_require(env, "NEURODOCK_PUBLIC_URL"),
            required_scopes=_required_scopes(env),
        )

    if provider == "clerk":
        # Clerk uses the OAuth proxy pattern (it does not expose WorkOS-style
        # metadata-forwarding DCR), so FastMCP fronts Clerk's OAuth endpoints.
        from fastmcp.server.auth.providers.clerk import ClerkProvider

        return ClerkProvider(
            domain=_require(env, "NEURODOCK_CLERK_DOMAIN"),
            client_id=_require(env, "NEURODOCK_CLERK_CLIENT_ID"),
            client_secret=env.get("NEURODOCK_CLERK_CLIENT_SECRET", "").strip() or None,
            base_url=_require(env, "NEURODOCK_PUBLIC_URL"),
            required_scopes=_required_scopes(env),
        )

    if provider == "jwt":
        # Generic OAuth resource server: validate JWTs from any OIDC issuer via its
        # JWKS endpoint, and advertise that issuer as the authorization server.
        from fastmcp.server.auth import RemoteAuthProvider
        from fastmcp.server.auth.providers.jwt import JWTVerifier
        from pydantic import AnyHttpUrl

        issuer = _require(env, "NEURODOCK_OAUTH_ISSUER")
        verifier = JWTVerifier(
            jwks_uri=_require(env, "NEURODOCK_OAUTH_JWKS_URI"),
            issuer=issuer,
            audience=_require(env, "NEURODOCK_OAUTH_AUDIENCE"),
            required_scopes=_required_scopes(env),
        )
        return RemoteAuthProvider(
            token_verifier=verifier,
            authorization_servers=[AnyHttpUrl(issuer)],
            base_url=_require(env, "NEURODOCK_PUBLIC_URL"),
        )

    raise AuthConfigError(
        f"unknown NEURODOCK_AUTH_PROVIDER={provider!r}; expected one of: "
        f"{', '.join(_KNOWN_PROVIDERS)}"
    )
