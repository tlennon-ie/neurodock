# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Run a single example through a single tool's deterministic baseline.

The runner is air-gapped: it imports the translation tools directly and
exercises their pure-Python deterministic path. NO LLM SDK is touched.

Each tool's input model accepts the example's `input` block via Pydantic.
The deterministic envelope's `deterministic_analysis` is then compared
against the example's `expected` block via the scorer.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from neurodock_evals.scoring import compare_expected
from neurodock_evals.types import CorpusExample, RunResult

logger = logging.getLogger(__name__)

# Pass threshold: a deterministic-baseline result is considered to "pass" when
# its field-level agreement with `expected` is at or above this value.
DEFAULT_PASS_THRESHOLD = 0.6


def _load_tool(tool_name: str) -> tuple[Callable[..., Any], type[Any]]:
    """Resolve a tool name to (callable, input_model).

    Imports are deferred so the harness can run even before the translation
    package is installed (e.g. when CI is wiring things up incrementally).
    """

    if tool_name == "translate_incoming":
        from neurodock_mcp_translation.tools.translate_incoming import translate_incoming
        from neurodock_mcp_translation.types import TranslateIncomingInput

        return translate_incoming, TranslateIncomingInput
    if tool_name == "check_tone":
        from neurodock_mcp_translation.tools.check_tone import check_tone
        from neurodock_mcp_translation.types import CheckToneInput

        return check_tone, CheckToneInput
    if tool_name == "rewrite_outgoing":
        from neurodock_mcp_translation.tools.rewrite_outgoing import rewrite_outgoing
        from neurodock_mcp_translation.types import RewriteOutgoingInput

        return rewrite_outgoing, RewriteOutgoingInput
    if tool_name == "brief_meeting":
        from neurodock_mcp_translation.tools.brief_meeting import brief_meeting
        from neurodock_mcp_translation.types import BriefMeetingInput

        return brief_meeting, BriefMeetingInput
    raise ValueError(f"Unknown tool: {tool_name!r}")


def _strip_input_for_tool(tool_name: str, raw: dict[str, Any]) -> dict[str, Any]:
    """Strip example-only keys that don't belong on the tool input model."""

    # `thread_context` is accepted by translate_incoming; nothing to strip there.
    # This hook exists for future tools that diverge.
    del tool_name
    return raw


def run_example(
    example: CorpusExample,
    tool_name: str,
    pass_threshold: float = DEFAULT_PASS_THRESHOLD,
) -> RunResult:
    """Run a single example through a single tool's deterministic baseline.

    Never logs example contents; on failure, returns a `RunResult` with the
    field deltas and a generic error message.
    """

    tool_callable, input_model = _load_tool(tool_name)
    try:
        payload = input_model.model_validate(_strip_input_for_tool(tool_name, example.input))
    except Exception as exc:  # pragma: no cover — surfaced via RunResult
        return RunResult(
            example_id=example.id,
            slice=example.slice,
            tool=tool_name,
            passed=False,
            score=0.0,
            schema_valid=False,
            deltas=[],
            error=f"input validation failed: {type(exc).__name__}",
        )

    try:
        envelope = tool_callable(payload)
    except Exception as exc:  # pragma: no cover — surfaced via RunResult
        return RunResult(
            example_id=example.id,
            slice=example.slice,
            tool=tool_name,
            passed=False,
            score=0.0,
            schema_valid=False,
            deltas=[],
            error=f"tool raised {type(exc).__name__}",
        )

    # Envelope -> deterministic analysis dict for comparison.
    actual = envelope.deterministic_analysis.model_dump(mode="python")
    score, deltas = compare_expected(example.expected, actual)
    return RunResult(
        example_id=example.id,
        slice=example.slice,
        tool=tool_name,
        passed=score >= pass_threshold,
        score=score,
        schema_valid=True,
        deltas=deltas,
        error=None,
    )
