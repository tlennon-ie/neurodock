# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Auth-provider selection tests (ADR 0009 §3).

These exercise the pure env -> provider mapping. They do not construct live IdP
connections: the error cases fail on missing config before any network call, and
the disabled case returns ``None``.
"""

from __future__ import annotations

import pytest
from neurodock_remote.auth import AuthConfigError, build_auth_provider


def test_unset_provider_disables_auth() -> None:
    assert build_auth_provider({}) is None


def test_explicit_none_disables_auth() -> None:
    assert build_auth_provider({"NEURODOCK_AUTH_PROVIDER": "none"}) is None


def test_provider_name_is_case_insensitive_and_trimmed() -> None:
    assert build_auth_provider({"NEURODOCK_AUTH_PROVIDER": "  NONE  "}) is None


def test_unknown_provider_raises() -> None:
    with pytest.raises(AuthConfigError):
        build_auth_provider({"NEURODOCK_AUTH_PROVIDER": "magic-idp"})


def test_clerk_without_config_raises() -> None:
    with pytest.raises(AuthConfigError):
        build_auth_provider({"NEURODOCK_AUTH_PROVIDER": "clerk"})


def test_workos_without_config_raises() -> None:
    with pytest.raises(AuthConfigError):
        build_auth_provider({"NEURODOCK_AUTH_PROVIDER": "workos"})


def test_jwt_without_config_raises() -> None:
    with pytest.raises(AuthConfigError):
        build_auth_provider(
            {
                "NEURODOCK_AUTH_PROVIDER": "jwt",
                "NEURODOCK_PUBLIC_URL": "https://mcp.neurodock.org",
            }
        )
