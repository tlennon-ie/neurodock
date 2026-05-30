# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""NeuroDock remote MCP server (ADR 0008/0009, Phase 2).

Composes the three STATELESS NeuroDock servers into a single Streamable HTTP
endpoint exposing only the remote-safe tool surface. Importing this package has
no side effects; build the server with :func:`build_combined_server` or the ASGI
factory :func:`create_app`.
"""

from __future__ import annotations

from neurodock_remote.app import (
    REMOTE_TOOL_NAMES,
    build_combined_server,
    create_app,
)

__all__ = ["REMOTE_TOOL_NAMES", "build_combined_server", "create_app"]
