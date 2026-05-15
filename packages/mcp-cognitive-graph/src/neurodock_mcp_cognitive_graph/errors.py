"""Structured tool errors.

Tool functions raise :class:`ToolError` with a code from the schema's ``errors``
table. The server layer catches these and converts them to a structured payload
so callers never see a Python traceback.
"""

from __future__ import annotations


class ToolError(Exception):
    """Structured error raised by a tool implementation."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message

    def to_payload(self) -> dict[str, str]:
        return {"error": self.code, "message": self.message}
