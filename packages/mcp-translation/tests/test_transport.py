# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Transport selection (ADR 0009, Phase 2 scaffolding).

Covers the pure ``select_transport`` helper plus the ``main()`` wiring. No test
binds a real socket: ``app.run`` is intercepted via monkeypatch so HTTP mode is
verified by the kwargs passed, not by a listening server.
"""

from __future__ import annotations

from typing import Any

import pytest
from neurodock_mcp_translation import server
from neurodock_mcp_translation.transport import (
    DEFAULT_HTTP_HOST,
    DEFAULT_HTTP_PORT,
    TransportConfig,
    select_transport,
)


def test_default_selects_stdio() -> None:
    """No env signal and no flag → stdio, with no host/port."""

    config = select_transport(env={}, argv=[])

    assert config == TransportConfig(transport="stdio", host=None, port=None)


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "Yes", "on", "  on  "])
def test_neurodock_http_truthy_selects_http_defaults(value: str) -> None:
    """A truthy NEURODOCK_HTTP (case-insensitive) → http on localhost:8000."""

    config = select_transport(env={"NEURODOCK_HTTP": value}, argv=[])

    assert config.transport == "http"
    assert config.host == DEFAULT_HTTP_HOST == "127.0.0.1"
    assert config.port == DEFAULT_HTTP_PORT == 8000


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "maybe"])
def test_neurodock_http_falsy_stays_stdio(value: str) -> None:
    """A non-truthy NEURODOCK_HTTP value must not flip to http."""

    config = select_transport(env={"NEURODOCK_HTTP": value}, argv=[])

    assert config.transport == "stdio"


def test_host_and_port_overrides_respected() -> None:
    """NEURODOCK_HTTP_HOST / NEURODOCK_HTTP_PORT override the defaults."""

    config = select_transport(
        env={
            "NEURODOCK_HTTP": "1",
            "NEURODOCK_HTTP_HOST": "0.0.0.0",
            "NEURODOCK_HTTP_PORT": "9123",
        },
        argv=[],
    )

    assert config == TransportConfig(transport="http", host="0.0.0.0", port=9123)


def test_http_flag_selects_http() -> None:
    """A --http argument selects http even without any env signal."""

    config = select_transport(env={}, argv=["--http"])

    assert config.transport == "http"
    assert config.host == DEFAULT_HTTP_HOST
    assert config.port == DEFAULT_HTTP_PORT


def test_invalid_port_falls_back_to_default() -> None:
    """A non-integer port string degrades to the 8000 default, not a crash."""

    config = select_transport(
        env={"NEURODOCK_HTTP": "1", "NEURODOCK_HTTP_PORT": "not-a-number"},
        argv=[],
    )

    assert config.port == DEFAULT_HTTP_PORT


def test_main_default_runs_stdio(monkeypatch: pytest.MonkeyPatch) -> None:
    """main() with no signal calls app.run() with no transport kwargs."""

    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(server.app, "run", lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(server.sys, "argv", ["neurodock-mcp-translation"])
    monkeypatch.delenv("NEURODOCK_HTTP", raising=False)

    server.main()

    assert calls == [{}]


def test_main_http_env_runs_streamable_http(monkeypatch: pytest.MonkeyPatch) -> None:
    """main() with NEURODOCK_HTTP=1 calls app.run(transport='http', host, port)."""

    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(server.app, "run", lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(server.sys, "argv", ["neurodock-mcp-translation"])
    monkeypatch.setenv("NEURODOCK_HTTP", "1")
    monkeypatch.delenv("NEURODOCK_HTTP_HOST", raising=False)
    monkeypatch.delenv("NEURODOCK_HTTP_PORT", raising=False)

    server.main()

    assert calls == [{"transport": "http", "host": "127.0.0.1", "port": 8000}]


def test_main_http_flag_runs_streamable_http(monkeypatch: pytest.MonkeyPatch) -> None:
    """main() with a --http argv flag calls app.run in http mode."""

    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(server.app, "run", lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(server.sys, "argv", ["neurodock-mcp-translation", "--http"])
    monkeypatch.delenv("NEURODOCK_HTTP", raising=False)

    server.main()

    assert calls == [{"transport": "http", "host": "127.0.0.1", "port": 8000}]
