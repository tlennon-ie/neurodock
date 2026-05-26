# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tool implementations for the task fractionator MCP server.

Each module here exposes a single pure function. The :mod:`server` module
wires those functions into FastMCP. Keeping tool code separate from the
framework glue makes the tools trivially unit-testable.
"""
