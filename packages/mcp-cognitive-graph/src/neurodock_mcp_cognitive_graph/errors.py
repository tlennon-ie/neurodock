# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Structured tool errors.

Tool functions raise :class:`ToolError` with a code from the schema's ``errors``
table. The server layer catches these and converts them to a structured payload
so callers never see a Python traceback.

A ``ToolError`` may carry an optional ``hint`` (one-sentence friendly
explainer for the caller) and ``example`` (a valid-call snippet the caller
can copy). These exist because the raw Pydantic / validation messages on
their own do not tell the caller what shape to send next — see the
``record_fact`` UX-friction note in MEMORY.md (2026-05-22 incident).
"""

from __future__ import annotations

from typing import Any


class ToolError(Exception):
    """Structured error raised by a tool implementation.

    ``code`` is the machine-readable identifier (one of the codes listed in
    each tool's ``errors`` block in ``schemas/``). ``message`` is the raw
    technical detail. ``hint`` and ``example`` are optional caller-facing
    aids that explain *what to do next* without making the caller parse
    the technical message.
    """

    def __init__(
        self,
        code: str,
        message: str,
        *,
        hint: str | None = None,
        example: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code
        self.message = message
        self.hint = hint
        self.example = example

    def to_payload(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"error": self.code, "message": self.message}
        if self.hint is not None:
            payload["hint"] = self.hint
        if self.example is not None:
            payload["example"] = self.example
        return payload


class InternalToolError(Exception):
    """An unexpected, non-user-facing failure inside a tool implementation.

    Distinct from :class:`ToolError`. The server layer catches this and
    surfaces an ``INTERNAL_ERROR`` payload without pretending the caller
    sent bad input. The original exception is preserved as ``__cause__``
    for log inspection.
    """

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message

    def to_payload(self) -> dict[str, Any]:
        return {
            "error": "INTERNAL_ERROR",
            "message": (
                "The cognitive graph hit an unexpected internal error. "
                "The call was not user input — this is a server-side issue. "
                f"Detail: {self.message}"
            ),
        }
