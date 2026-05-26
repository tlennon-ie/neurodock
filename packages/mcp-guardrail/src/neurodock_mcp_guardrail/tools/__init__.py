# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tool implementations for ``mcp-guardrail``.

One tool per module. The server in :mod:`neurodock_mcp_guardrail.server`
binds each tool function into the FastMCP instance and is responsible for
catching tool exceptions at the boundary and translating them into
structured MCP error responses.
"""
