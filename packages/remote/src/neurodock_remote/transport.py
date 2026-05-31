# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Bind-address resolution for the remote server.

Unlike the per-package ``transport.py`` helpers (which choose stdio vs HTTP), the
remote server is *always* HTTP — it exists to be served. This helper only resolves
the bind host/port from the environment.

The code default is ``127.0.0.1`` (safe: a bare local run is not reachable off the
box). The container image opts into all-interfaces binding explicitly by setting
``NEURODOCK_HTTP_HOST=0.0.0.0`` in its environment, so the all-interfaces bind is a
deliberate deployment decision rather than a code default.
"""

from __future__ import annotations

from collections.abc import Mapping

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000


def _parse_port(raw: str | None) -> int:
    """Parse a port override, falling back to the default on missing/invalid input."""
    if raw is None or raw.strip() == "":
        return DEFAULT_PORT
    try:
        port = int(raw.strip())
    except ValueError:
        return DEFAULT_PORT
    return port if 1 <= port <= 65535 else DEFAULT_PORT


def resolve_bind(env: Mapping[str, str]) -> tuple[str, int]:
    """Resolve ``(host, port)`` from ``NEURODOCK_HTTP_HOST`` / ``NEURODOCK_HTTP_PORT``."""
    host = env.get("NEURODOCK_HTTP_HOST", "").strip() or DEFAULT_HOST
    port = _parse_port(env.get("NEURODOCK_HTTP_PORT"))
    return host, port
