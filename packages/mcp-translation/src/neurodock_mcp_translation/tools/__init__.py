# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tool implementations for the translation server.

Each module exposes a pure function that takes a Pydantic input model and
returns a Pydantic envelope model. The FastMCP server wires these to MCP
tool calls in ``server.py``.
"""

from neurodock_mcp_translation.tools.brief_meeting import (
    VerbatimAnchorFailedError,
    brief_meeting,
)
from neurodock_mcp_translation.tools.check_tone import check_tone
from neurodock_mcp_translation.tools.rewrite_outgoing import rewrite_outgoing
from neurodock_mcp_translation.tools.translate_incoming import translate_incoming

__all__ = [
    "VerbatimAnchorFailedError",
    "brief_meeting",
    "check_tone",
    "rewrite_outgoing",
    "translate_incoming",
]
