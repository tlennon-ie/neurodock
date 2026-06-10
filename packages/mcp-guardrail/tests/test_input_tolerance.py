# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Caller-input tolerance for the guardrail tools (Bug A regression).

The nested objects an LLM assembles for check_rumination / check_hyperfocus /
check_sycophancy used to be validated by `extra="forbid"` models that required
exact keys (`text`, `at`, ...). Because the advertised MCP schema is an open
object, the caller could not know those keys, so natural shapes
({"prompt","timestamp"}, {"text"}) failed with an opaque INPUT_INVALID. These
tests pin the loosened behaviour: alias the common fields, ignore extras, and
emit an actionable field-named error.
"""

from __future__ import annotations

import pytest
from neurodock_mcp_guardrail.server import _validation_message
from neurodock_mcp_guardrail.types import (
    RuminationInput,
    SycophancyInput,
)
from pydantic import ValidationError


def test_rumination_history_accepts_prompt_timestamp_aliases() -> None:
    payload = RuminationInput.model_validate(
        {
            "current_prompt": "should I rewrite the intro again",
            # Natural LLM shape: prompt/timestamp, plus an extra key.
            "history": [
                {
                    "prompt": "should I rewrite the intro",
                    "timestamp": "2026-06-10T09:00:00Z",
                    "role": "user",
                },
            ],
        }
    )
    assert payload.history[0].text == "should I rewrite the intro"
    assert payload.history[0].at == "2026-06-10T09:00:00Z"


def test_rumination_history_accepts_canonical_keys_too() -> None:
    payload = RuminationInput.model_validate(
        {
            "current_prompt": "x",
            "history": [{"text": "y", "at": "2026-06-10T09:00:00Z"}],
        }
    )
    assert payload.history[0].text == "y"


def test_sycophancy_accepts_bare_text_message_without_timestamp() -> None:
    # The blocker the QA pass hit: a {"text": ...} object (no `at`) is valid for
    # sycophancy, which is not time-windowed.
    payload = SycophancyInput.model_validate(
        {"recent_user_messages": [{"text": "are you sure that's right?"}]}
    )
    assert payload.recent_user_messages is not None
    assert payload.recent_user_messages[0].text == "are you sure that's right?"
    assert payload.recent_user_messages[0].at is None


def test_validation_message_names_the_offending_field() -> None:
    with pytest.raises(ValidationError) as caught:
        RuminationInput.model_validate(
            {"current_prompt": "x", "history": [{"timestamp": "2026-06-10T09:00:00Z"}]}
        )
    message = _validation_message(caught.value)
    assert "input failed schema validation" in message
    # Names the path + reason rather than the old opaque blanket message.
    assert "history" in message and "0" in message
    assert "input failed schema validation —" in message
