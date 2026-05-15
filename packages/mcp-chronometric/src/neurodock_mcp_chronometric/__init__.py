"""NeuroDock chronometric MCP server — time, idle, and break management.

v0.0.1 — in-memory implementation of the five tools specified in
``packages/mcp-chronometric/schemas/*.schema.json`` and ADR 0001.

# TODO: persist session state to SQLite before v0.1.0 ships.
"""

from neurodock_mcp_chronometric.clock import Clock, SystemClock
from neurodock_mcp_chronometric.server import build_server
from neurodock_mcp_chronometric.state import SessionState

__version__ = "0.0.1"

__all__ = [
    "Clock",
    "SessionState",
    "SystemClock",
    "__version__",
    "build_server",
]
