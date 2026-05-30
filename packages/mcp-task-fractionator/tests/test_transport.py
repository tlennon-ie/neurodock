# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Transport-selection tests (ADR 0009 Phase 2).

Three concerns are covered:

1. The pure :func:`select_transport` helper (env dict + argv -> config), which
   is unit-testable without binding a socket.
2. The :func:`main` entrypoint wiring, exercised by monkeypatching ``run`` so
   no real network listener is started.
3. The tool-scope boundary: the HTTP build exposes ONLY ``decompose``; the
   stdio build exposes BOTH ``decompose`` and ``next_one``.
"""

from __future__ import annotations

from typing import Any

import pytest
from fastmcp import FastMCP
from neurodock_mcp_task_fractionator import server as server_module
from neurodock_mcp_task_fractionator.server import build_server
from neurodock_mcp_task_fractionator.sources import InMemoryPendingTaskSource
from neurodock_mcp_task_fractionator.transport import (
    DEFAULT_HTTP_HOST,
    DEFAULT_HTTP_PORT,
    TransportConfig,
    select_transport,
)

# --------------------------------------------------------------------------- #
# Pure helper: select_transport
# --------------------------------------------------------------------------- #


def test_default_selects_stdio() -> None:
    """No HTTP signal at all -> stdio with no host/port."""

    config = select_transport(env={}, argv=[])

    assert config == TransportConfig(transport="stdio", host=None, port=None)


@pytest.mark.parametrize("value", ["1", "true", "TRUE", "Yes", "on", "  on  "])
def test_truthy_env_selects_http(value: str) -> None:
    """NEURODOCK_HTTP truthy (case-insensitive, trimmed) -> http on defaults."""

    config = select_transport(env={"NEURODOCK_HTTP": value}, argv=[])

    assert config.transport == "http"
    assert config.host == DEFAULT_HTTP_HOST
    assert config.port == DEFAULT_HTTP_PORT


@pytest.mark.parametrize("value", ["0", "false", "no", "off", "", "maybe"])
def test_falsy_env_stays_stdio(value: str) -> None:
    """Anything not in the truthy set leaves the default stdio transport."""

    config = select_transport(env={"NEURODOCK_HTTP": value}, argv=[])

    assert config.transport == "stdio"


def test_http_cli_flag_selects_http() -> None:
    """A --http arg selects http even with no env var present."""

    config = select_transport(env={}, argv=["--http"])

    assert config.transport == "http"
    assert config.host == DEFAULT_HTTP_HOST
    assert config.port == DEFAULT_HTTP_PORT


def test_host_and_port_overrides_are_applied() -> None:
    """NEURODOCK_HTTP_HOST / NEURODOCK_HTTP_PORT override the defaults."""

    config = select_transport(
        env={
            "NEURODOCK_HTTP": "1",
            "NEURODOCK_HTTP_HOST": "0.0.0.0",
            "NEURODOCK_HTTP_PORT": "9001",
        },
        argv=[],
    )

    assert config == TransportConfig(transport="http", host="0.0.0.0", port=9001)


@pytest.mark.parametrize("raw", ["abc", "70000", "0", "-1", ""])
def test_invalid_port_falls_back_to_default(raw: str) -> None:
    """Unparseable / out-of-range ports fall back to 8000 rather than crashing."""

    config = select_transport(env={"NEURODOCK_HTTP": "1", "NEURODOCK_HTTP_PORT": raw}, argv=[])

    assert config.port == DEFAULT_HTTP_PORT


# --------------------------------------------------------------------------- #
# main() wiring — monkeypatch run so no socket binds
# --------------------------------------------------------------------------- #


class _RunRecorder:
    """Records the args FastMCP.run was called with, instead of binding a socket.

    Patched onto the FastMCP class as an attribute, this instance is *not* a
    function, so the descriptor protocol does not bind ``self``; the bound
    server instance is therefore absent from the call and the signature simply
    captures positional and keyword args.
    """

    def __init__(self) -> None:
        self.called = False
        self.kwargs: dict[str, Any] = {}

    def __call__(self, *args: Any, **kwargs: Any) -> None:
        self.called = True
        self.kwargs = kwargs


@pytest.fixture
def run_recorder(monkeypatch: pytest.MonkeyPatch) -> _RunRecorder:
    """Patch FastMCP.run on the class so both the module app and freshly
    built HTTP apps are intercepted without opening a port."""

    recorder = _RunRecorder()
    monkeypatch.setattr(FastMCP, "run", recorder, raising=True)
    return recorder


def test_main_defaults_to_stdio(
    monkeypatch: pytest.MonkeyPatch, run_recorder: _RunRecorder
) -> None:
    """With no env signal and no --http, main() runs stdio (no transport kwarg)."""

    monkeypatch.delenv("NEURODOCK_HTTP", raising=False)
    monkeypatch.setattr(server_module.sys, "argv", ["prog"])

    server_module.main()

    assert run_recorder.called is True
    # stdio path calls app.run() with no transport/host/port kwargs.
    assert run_recorder.kwargs == {}


def test_main_env_selects_http_on_default_host_port(
    monkeypatch: pytest.MonkeyPatch, run_recorder: _RunRecorder
) -> None:
    """NEURODOCK_HTTP=1 runs http bound to 127.0.0.1:8000."""

    monkeypatch.setenv("NEURODOCK_HTTP", "1")
    monkeypatch.delenv("NEURODOCK_HTTP_HOST", raising=False)
    monkeypatch.delenv("NEURODOCK_HTTP_PORT", raising=False)
    monkeypatch.setattr(server_module.sys, "argv", ["prog"])

    server_module.main()

    assert run_recorder.called is True
    assert run_recorder.kwargs["transport"] == "http"
    assert run_recorder.kwargs["host"] == "127.0.0.1"
    assert run_recorder.kwargs["port"] == 8000


def test_main_http_host_and_port_overrides(
    monkeypatch: pytest.MonkeyPatch, run_recorder: _RunRecorder
) -> None:
    """Host/port env overrides flow through to the http run() call."""

    monkeypatch.setenv("NEURODOCK_HTTP", "1")
    monkeypatch.setenv("NEURODOCK_HTTP_HOST", "0.0.0.0")
    monkeypatch.setenv("NEURODOCK_HTTP_PORT", "9100")
    monkeypatch.setattr(server_module.sys, "argv", ["prog"])

    server_module.main()

    assert run_recorder.kwargs["transport"] == "http"
    assert run_recorder.kwargs["host"] == "0.0.0.0"
    assert run_recorder.kwargs["port"] == 9100


def test_main_http_cli_flag(monkeypatch: pytest.MonkeyPatch, run_recorder: _RunRecorder) -> None:
    """A --http CLI arg selects http even without the env var."""

    monkeypatch.delenv("NEURODOCK_HTTP", raising=False)
    monkeypatch.setattr(server_module.sys, "argv", ["prog", "--http"])

    server_module.main()

    assert run_recorder.kwargs["transport"] == "http"
    assert run_recorder.kwargs["host"] == "127.0.0.1"
    assert run_recorder.kwargs["port"] == 8000


# --------------------------------------------------------------------------- #
# Tool-scope boundary: decompose-only over HTTP
# --------------------------------------------------------------------------- #


async def test_http_build_exposes_only_decompose() -> None:
    """The HTTP build CONTAINS decompose and does NOT contain next_one."""

    http_server = build_server(source=InMemoryPendingTaskSource(), http_mode=True)

    names = {tool.name for tool in await http_server.list_tools()}

    assert "decompose" in names
    assert "next_one" not in names
    assert names == {"decompose"}


async def test_stdio_build_exposes_both_tools() -> None:
    """The stdio build CONTAINS both decompose and next_one (unchanged today)."""

    stdio_server = build_server(source=InMemoryPendingTaskSource())

    names = {tool.name for tool in await stdio_server.list_tools()}

    assert names == {"decompose", "next_one"}
