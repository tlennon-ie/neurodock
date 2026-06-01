# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the Turso Platform API client (ADR 0010 Phase C).

NO real Turso and NO network: an ``httpx.MockTransport`` stands in for the
Platform API so the client's *own* request shaping and response parsing are
exercised against canned responses. The endpoints/payloads match the documented
Turso Platform API (create database, mint token, destroy database).
"""

from __future__ import annotations

import importlib.util
import json

import pytest

_HAS_HTTPX = importlib.util.find_spec("httpx") is not None

pytestmark = pytest.mark.skipif(not _HAS_HTTPX, reason="requires the optional httpx client")

if _HAS_HTTPX:
    import httpx
    from neurodock_state.turso_platform import (
        DatabaseInfo,
        HttpxTursoPlatformClient,
        TursoPlatformError,
    )

_ORG = "acme"
_TOKEN = "platform-secret"


def _client(handler) -> HttpxTursoPlatformClient:  # type: ignore[no-untyped-def]
    return HttpxTursoPlatformClient(
        organization=_ORG,
        platform_token=_TOKEN,
        transport=httpx.MockTransport(handler),
    )


def test_requires_org_and_token() -> None:
    with pytest.raises(TursoPlatformError):
        HttpxTursoPlatformClient(organization="  ", platform_token=_TOKEN)
    with pytest.raises(TursoPlatformError):
        HttpxTursoPlatformClient(organization=_ORG, platform_token="  ")


def test_create_database_posts_name_and_group_and_returns_info() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["url"] = str(request.url)
        seen["auth"] = request.headers.get("authorization")
        seen["body"] = json.loads(request.read().decode())
        return httpx.Response(
            200,
            json={"database": {"Name": "nd-x", "Hostname": "nd-x-acme.turso.io"}},
        )

    info = _client(handler).create_database("nd-x", "default")

    assert seen["method"] == "POST"
    assert seen["url"] == "https://api.turso.tech/v1/organizations/acme/databases"
    assert seen["auth"] == "Bearer platform-secret"
    assert seen["body"] == {"name": "nd-x", "group": "default"}
    assert info == DatabaseInfo(name="nd-x", hostname="nd-x-acme.turso.io")
    assert info.url == "libsql://nd-x-acme.turso.io"


def test_create_database_treats_conflict_as_idempotent_success() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(409, json={"error": "database already exists"})

    info = _client(handler).create_database("nd-x", "default")

    # 409 → reuse the existing DB, host resolved from the org/name convention.
    assert info == DatabaseInfo(name="nd-x", hostname="nd-x-acme.turso.io")


def test_create_database_falls_back_to_conventional_hostname() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        # Response omits a usable Hostname.
        return httpx.Response(200, json={"database": {"Name": "nd-x"}})

    info = _client(handler).create_database("nd-x", "default")
    assert info.hostname == "nd-x-acme.turso.io"


def test_create_database_raises_on_server_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "group not found"})

    with pytest.raises(TursoPlatformError) as exc:
        _client(handler).create_database("nd-x", "missing")
    assert exc.value.status == 400


def test_create_token_returns_jwt() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"jwt": "minted-token"})

    token = _client(handler).create_token("nd-x")

    assert token == "minted-token"
    assert seen["method"] == "POST"
    assert seen["url"] == "https://api.turso.tech/v1/organizations/acme/databases/nd-x/auth/tokens"


def test_create_token_raises_when_jwt_missing() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"not_jwt": "x"})

    with pytest.raises(TursoPlatformError):
        _client(handler).create_token("nd-x")


def test_destroy_database_issues_delete() -> None:
    seen: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["method"] = request.method
        seen["url"] = str(request.url)
        return httpx.Response(200, json={"database": "nd-x"})

    _client(handler).destroy_database("nd-x")

    assert seen["method"] == "DELETE"
    assert seen["url"] == "https://api.turso.tech/v1/organizations/acme/databases/nd-x"


def test_destroy_database_treats_404_as_idempotent() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"error": "record not found"})

    # No raise: erase is idempotent even if the DB is already gone.
    _client(handler).destroy_database("nd-x")
