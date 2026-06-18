# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""FastMCP server registration for the four translation tools.

Per ADR 0005 §1 the server itself does NOT import any LLM vendor SDK. Each
tool runs deterministic baseline analysis and returns a structured prompt the
caller's MCP client MAY execute against its configured LLM (Claude, Ollama,
OpenAI, ...). The server is provider-agnostic.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Any

from fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import ValidationError

from neurodock_mcp_translation.tools.brief_meeting import (
    VerbatimAnchorFailedError,
    brief_meeting,
)
from neurodock_mcp_translation.tools.check_tone import check_tone
from neurodock_mcp_translation.tools.rewrite_outgoing import rewrite_outgoing
from neurodock_mcp_translation.tools.translate_incoming import translate_incoming
from neurodock_mcp_translation.transport import select_transport
from neurodock_mcp_translation.types import (
    BriefMeetingInput,
    CheckToneInput,
    RewriteOutgoingInput,
    TargetRegister,
    TranslateIncomingInput,
)

SERVER_NAME = "neurodock-mcp-translation"
SERVER_VERSION = "0.0.1"

_LOG = logging.getLogger("neurodock_mcp_translation.server")


class _ToolError(RuntimeError):
    """Internal exception type that carries an MCP-friendly error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


def _validation_error_code(exc: ValidationError, default: str) -> str:
    """Map a pydantic ValidationError onto the schema's error code, by best effort."""

    for error in exc.errors():
        loc = ".".join(str(part) for part in error.get("loc", ()))
        error_type = error.get("type", "")
        if "text" in loc and error_type in {"missing", "string_too_short"}:
            return "TEXT_REQUIRED"
        if "text" in loc and "too_long" in error_type:
            return "TEXT_TOO_LONG"
        if loc.endswith("transcript") and error_type in {"missing", "string_too_short"}:
            return "TRANSCRIPT_REQUIRED"
        if loc.endswith("transcript") and "too_long" in error_type:
            return "TRANSCRIPT_TOO_LONG"
        if loc.endswith("me") and error_type in {"missing", "string_too_short"}:
            return "ME_REQUIRED"
        if loc.endswith("target_register") and error_type == "missing":
            return "TARGET_REGISTER_REQUIRED"
        if "target_register" in loc and "literal" in error_type:
            return "TARGET_REGISTER_UNKNOWN"
        if "channel" in loc and "literal" in error_type:
            return "CHANNEL_UNKNOWN"
        if "preserve_terms" in loc and "too_long" in error_type:
            return "PRESERVE_TERMS_TOO_MANY"
    return default


def build_server() -> FastMCP[Any]:
    """Construct the FastMCP server with the four tools registered."""

    mcp: FastMCP[Any] = FastMCP(name=SERVER_NAME, version=SERVER_VERSION)

    @mcp.tool(
        name="translate_incoming",
        description=(
            "Decode subtext, ambiguity, and the likely implicit ask in an "
            "incoming message. Returns a deterministic baseline analysis plus a "
            "structured prompt the caller's MCP client MAY execute to refine "
            "the baseline against its own LLM."
        ),
        annotations=ToolAnnotations(
            title="Translate incoming message",
            readOnlyHint=True,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    def _translate_incoming(
        text: str,
        channel: str | None = None,
        thread_context: list[str] | None = None,
        target_language: str | None = None,
        reader_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "translate_incoming"})
        try:
            payload = TranslateIncomingInput(
                text=text,
                channel=channel,  # type: ignore[arg-type]
                thread_context=thread_context,
                target_language=target_language,
                reader_context=reader_context,  # type: ignore[arg-type]
            )
        except ValidationError as exc:
            raise _ToolError(_validation_error_code(exc, "TEXT_REQUIRED"), str(exc)) from exc
        envelope = translate_incoming(payload)
        return envelope.model_dump(exclude_none=False)

    @mcp.tool(
        name="check_tone",
        description=(
            "Score an outgoing message on directness / warmth / urgency axes "
            "(0..100), optionally relative to a baseline of the sender's prior "
            "messages, and flag phrases that deviate substantially from "
            "baseline or from a target register. Returns deterministic axes plus "
            "an LLM-refinement prompt."
        ),
        annotations=ToolAnnotations(
            title="Check tone",
            readOnlyHint=True,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    def _check_tone(
        text: str,
        baseline_messages: list[str] | None = None,
        target_register: TargetRegister | None = None,
        channel: str | None = None,
        reader_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "check_tone"})
        try:
            payload = CheckToneInput(
                text=text,
                baseline_messages=baseline_messages,
                target_register=target_register,
                channel=channel,  # type: ignore[arg-type]
                reader_context=reader_context,  # type: ignore[arg-type]
            )
        except ValidationError as exc:
            raise _ToolError(_validation_error_code(exc, "TEXT_REQUIRED"), str(exc)) from exc
        envelope = check_tone(payload)
        return envelope.model_dump(exclude_none=False)

    @mcp.tool(
        name="rewrite_outgoing",
        description=(
            "Rewrite an outgoing message toward a target register while "
            "preserving caller-named technical terms. The deterministic "
            "baseline applies register-specific surface transforms; the LLM "
            "refinement prompt produces a stronger rewrite while keeping the "
            "same preservation contract."
        ),
        annotations=ToolAnnotations(
            title="Rewrite outgoing",
            readOnlyHint=True,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    def _rewrite_outgoing(
        text: str,
        target_register: TargetRegister,
        preserve_terms: list[str] | None = None,
        channel: str | None = None,
        preserve_intent: bool = True,
        reader_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "rewrite_outgoing"})
        try:
            payload = RewriteOutgoingInput(
                text=text,
                target_register=target_register,
                preserve_terms=preserve_terms,
                channel=channel,  # type: ignore[arg-type]
                preserve_intent=preserve_intent,
                reader_context=reader_context,  # type: ignore[arg-type]
            )
        except ValidationError as exc:
            raise _ToolError(
                _validation_error_code(exc, "TARGET_REGISTER_REQUIRED"), str(exc)
            ) from exc
        envelope = rewrite_outgoing(payload)
        return envelope.model_dump(exclude_none=False)

    @mcp.tool(
        name="brief_meeting",
        description=(
            "Convert a meeting transcript into a four-section structured brief: "
            "my_asks, others_asks, decisions, ambiguous_items. Every "
            "ambiguous_item is anchored to a verbatim transcript span; the "
            "server rejects responses where the anchor cannot be located."
        ),
        annotations=ToolAnnotations(
            title="Brief meeting",
            readOnlyHint=True,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    def _brief_meeting(
        transcript: str,
        me: str,
        project: str | None = None,
        speakers: list[str] | None = None,
        reader_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "brief_meeting"})
        try:
            payload = BriefMeetingInput(
                transcript=transcript,
                me=me,
                project=project,
                speakers=speakers,
                reader_context=reader_context,  # type: ignore[arg-type]
            )
        except ValidationError as exc:
            raise _ToolError(_validation_error_code(exc, "TRANSCRIPT_REQUIRED"), str(exc)) from exc
        try:
            envelope = brief_meeting(payload)
        except VerbatimAnchorFailedError as exc:
            raise _ToolError("VERBATIM_ANCHOR_FAILED", str(exc)) from exc
        return envelope.model_dump(exclude_none=False)

    return mcp


# Module-level "default" server, useful for ``python -m`` and smoke tests.
app: FastMCP[Any] = build_server()


def main() -> None:
    """Console-script entrypoint.

    Runs over stdio by default (ADR 0009 — byte-for-byte unchanged install
    path). HTTP (FastMCP Streamable HTTP) is opt-in via the ``NEURODOCK_HTTP``
    env var or a ``--http`` flag; see ``transport.select_transport``.
    """

    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format='{"logger":"%(name)s","level":"%(levelname)s","msg":"%(message)s"}',
    )

    config = select_transport(os.environ, sys.argv[1:])
    if config.transport == "stdio":
        _LOG.info("transport_selected", extra={"transport": "stdio"})
        app.run()
        return

    _LOG.info(
        "transport_selected",
        extra={"transport": "http", "host": config.host, "port": config.port},
    )
    app.run(transport="http", host=config.host, port=config.port)


if __name__ == "__main__":  # pragma: no cover — exercised via console script
    main()
