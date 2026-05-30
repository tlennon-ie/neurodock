# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Transport selection for the NeuroDock stateless MCP servers (ADR 0009, Phase 2).

stdio is the default and stays byte-for-byte unchanged. HTTP (FastMCP's
Streamable HTTP transport) is opt-in via the ``NEURODOCK_HTTP`` env var (truthy:
``1``/``true``/``yes``/``on``, case-insensitive) or a ``--http`` CLI flag, binding
to ``NEURODOCK_HTTP_HOST`` (default ``127.0.0.1``) and ``NEURODOCK_HTTP_PORT``
(default ``8000``). The helper is pure — env mapping + argv in, config out — so the
selection logic is unit-testable without binding a socket. Per ADR 0009 §3 auth is
deferred and the bare flag binds to localhost only.

The three stateless servers (translation, guardrail, task-fractionator) keep an
identical copy of this module: they are independently published packages and
cannot share an import, so the contract is held identical by duplication.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Literal, NamedTuple

_TRUTHY = frozenset({"1", "true", "yes", "on"})
DEFAULT_HTTP_HOST = "127.0.0.1"
DEFAULT_HTTP_PORT = 8000


class TransportConfig(NamedTuple):
    """The chosen transport and (for HTTP) its bind target.

    ``host`` and ``port`` are ``None`` for stdio.
    """

    transport: Literal["stdio", "http"]
    host: str | None = None
    port: int | None = None


def _is_truthy(value: str | None) -> bool:
    return value is not None and value.strip().lower() in _TRUTHY


def _parse_port(raw: str | None) -> int:
    """Parse a port override, falling back to the default on missing/invalid input."""
    if raw is None or raw.strip() == "":
        return DEFAULT_HTTP_PORT
    try:
        port = int(raw.strip())
    except ValueError:
        return DEFAULT_HTTP_PORT
    return port if 1 <= port <= 65535 else DEFAULT_HTTP_PORT


def select_transport(env: Mapping[str, str], argv: Sequence[str]) -> TransportConfig:
    """Decide the transport from an env mapping and argv, without side effects.

    HTTP is selected when ``NEURODOCK_HTTP`` is truthy OR ``--http`` is present in
    ``argv``; otherwise stdio. ``argv`` excludes the program name (``sys.argv[1:]``).
    """
    http_requested = _is_truthy(env.get("NEURODOCK_HTTP")) or ("--http" in argv)
    if not http_requested:
        return TransportConfig(transport="stdio")
    host = env.get("NEURODOCK_HTTP_HOST", "").strip() or DEFAULT_HTTP_HOST
    port = _parse_port(env.get("NEURODOCK_HTTP_PORT"))
    return TransportConfig(transport="http", host=host, port=port)
