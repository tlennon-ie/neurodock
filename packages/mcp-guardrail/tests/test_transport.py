# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Transport-selection tests (ADR 0009, Phase 2 scaffolding).

Covers the pure ``select_transport`` helper plus the ``main()`` wiring. No test
binds a real socket: ``app.run`` is intercepted via monkeypatch so HTTP mode is
verified by the kwargs passed, not by a listening server. Detector/tool logic is
untouched here.
"""

from __future__ import annotations

from typing import Any

import pytest
from neurodock_mcp_guardrail import server
from neurodock_mcp_guardrail.transport import (
    DEFAULT_HTTP_HOST,
    DEFAULT_HTTP_PORT,
    TransportConfig,
    select_transport,
)


def test_default_selects_stdio() -> None:
    config = select_transport(env={}, argv=[])
    assert config == TransportConfig(transport="stdio", host=None, port=None)


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "Yes", "on", "  on  "])
def test_neurodock_http_truthy_selects_http_defaults(value: str) -> None:
    config = select_transport(env={"NEURODOCK_HTTP": value}, argv=[])
    assert config.transport == "http"
    assert config.host == DEFAULT_HTTP_HOST == "127.0.0.1"
    assert config.port == DEFAULT_HTTP_PORT == 8000


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "maybe"])
def test_neurodock_http_falsy_stays_stdio(value: str) -> None:
    config = select_transport(env={"NEURODOCK_HTTP": value}, argv=[])
    assert config.transport == "stdio"


def test_host_and_port_overrides_respected() -> None:
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
    config = select_transport(env={}, argv=["--http"])
    assert config.transport == "http"
    assert config.host == DEFAULT_HTTP_HOST
    assert config.port == DEFAULT_HTTP_PORT


@pytest.mark.parametrize("raw", ["abc", "70000", "0", "-1", ""])
def test_invalid_port_falls_back_to_default(raw: str) -> None:
    """Unparseable / out-of-range ports fall back to 8000 rather than crashing."""
    config = select_transport(env={"NEURODOCK_HTTP": "1", "NEURODOCK_HTTP_PORT": raw}, argv=[])
    assert config.port == DEFAULT_HTTP_PORT


def test_main_default_runs_stdio(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(server.app, "run", lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(server.sys, "argv", ["neurodock-mcp-guardrail"])
    monkeypatch.delenv("NEURODOCK_HTTP", raising=False)

    server.main()

    assert calls == [{}]


def test_main_http_env_runs_http(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(server.app, "run", lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(server.sys, "argv", ["neurodock-mcp-guardrail"])
    monkeypatch.setenv("NEURODOCK_HTTP", "1")
    monkeypatch.delenv("NEURODOCK_HTTP_HOST", raising=False)
    monkeypatch.delenv("NEURODOCK_HTTP_PORT", raising=False)

    server.main()

    assert calls == [{"transport": "http", "host": "127.0.0.1", "port": 8000}]


def test_main_http_respects_host_and_port(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(server.app, "run", lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(server.sys, "argv", ["neurodock-mcp-guardrail"])
    monkeypatch.setenv("NEURODOCK_HTTP", "yes")
    monkeypatch.setenv("NEURODOCK_HTTP_HOST", "localhost")
    monkeypatch.setenv("NEURODOCK_HTTP_PORT", "8765")

    server.main()

    assert calls == [{"transport": "http", "host": "localhost", "port": 8765}]


def test_main_http_flag_runs_http(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[dict[str, Any]] = []
    monkeypatch.setattr(server.app, "run", lambda **kwargs: calls.append(kwargs))
    monkeypatch.setattr(server.sys, "argv", ["neurodock-mcp-guardrail", "--http"])
    monkeypatch.delenv("NEURODOCK_HTTP", raising=False)

    server.main()

    assert calls == [{"transport": "http", "host": "127.0.0.1", "port": 8000}]
