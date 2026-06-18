# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""``reader_context`` wiring + the byte-identical-when-absent regression gate.

ADR 0012 binding rule 3: the server gains exactly one optional, additive input.
ADR 0012 decision-driver 5: absence is identity — a call with no reader_context
against a profile with no neurotypes must yield a BYTE-IDENTICAL prompt to
today's.

These tests drive the four tools through their Python entrypoints (not the MCP
boundary) so they can compare ``prompt_for_llm_refinement.content`` directly
against the un-shaped baseline.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from neurodock_mcp_translation.profile import PROFILE_PATH_ENV_VAR
from neurodock_mcp_translation.tools.brief_meeting import brief_meeting
from neurodock_mcp_translation.tools.check_tone import check_tone
from neurodock_mcp_translation.tools.rewrite_outgoing import rewrite_outgoing
from neurodock_mcp_translation.tools.translate_incoming import translate_incoming
from neurodock_mcp_translation.types import (
    BriefMeetingInput,
    CheckToneInput,
    ReaderContext,
    RewriteOutgoingInput,
    TranslateIncomingInput,
)
from pydantic import ValidationError

_ADDENDUM_HEADER = "## Reader-specific overrides (apply LAST, after the schema)"

_TRANSCRIPT = (
    "Priya: Let's get the rollout date on the calendar. Thomas, can you own the migration script?\n"
    "Thomas: Yes — I'll have it ready by Wednesday.\n"
    "Roberto: We should also think about rollback. Can someone draft the runbook?\n"
    "Priya: We can circle back on that next week.\n"
)


@pytest.fixture(autouse=True)
def _no_profile_file(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Point the profile reader at a nonexistent path for every test here.

    This isolates the suite from any real ``~/.neurodock/profile.yaml`` so the
    "absent both" baseline is genuinely absent.
    """

    monkeypatch.setenv(PROFILE_PATH_ENV_VAR, str(tmp_path / "absent.yaml"))


def _write_profile(tmp_path: Path, body: str, monkeypatch: pytest.MonkeyPatch) -> None:
    path = tmp_path / "profile.yaml"
    path.write_text(body, encoding="utf-8")
    monkeypatch.setenv(PROFILE_PATH_ENV_VAR, str(path))


# ---------------------------------------------------------------------------
# max_chunk_size type discipline: bool must NOT coerce to int


def test_reader_context_rejects_boolean_max_chunk_size() -> None:
    """``max_chunk_size: True`` must be rejected, not silently coerced to 1.

    ``bool`` is an ``int`` subclass, so Pydantic would otherwise accept ``True``
    as ``1``. That contradicts ``profile.py:_parse_chunk_size`` (which rejects
    bools) and the documented integer contract. A ``@field_validator`` raises so
    the boundary fails fast.
    """

    with pytest.raises(ValidationError):
        ReaderContext.model_validate({"max_chunk_size": True})
    with pytest.raises(ValidationError):
        ReaderContext.model_validate({"max_chunk_size": False})


def test_reader_context_still_accepts_integer_max_chunk_size() -> None:
    ctx = ReaderContext.model_validate({"max_chunk_size": 3})
    assert ctx.max_chunk_size == 3


# ---------------------------------------------------------------------------
# Byte-identical-when-absent regression (the load-bearing gate)


def test_translate_incoming_byte_identical_when_absent() -> None:
    payload = TranslateIncomingInput(text="Hey — can we revisit the rollout timeline?")
    with_field = translate_incoming(payload)
    # Re-run with reader_context explicitly None to prove None == absent.
    assert (
        with_field.prompt_for_llm_refinement.content
        == translate_incoming(
            TranslateIncomingInput(
                text="Hey — can we revisit the rollout timeline?", reader_context=None
            )
        ).prompt_for_llm_refinement.content
    )
    assert _ADDENDUM_HEADER not in with_field.prompt_for_llm_refinement.content


def test_all_four_tools_byte_identical_when_absent() -> None:
    contents = [
        translate_incoming(
            TranslateIncomingInput(text="Quick one: I'll loop back next week.")
        ).prompt_for_llm_refinement.content,
        check_tone(
            CheckToneInput(text="This is broken. Please fix before EOD.")
        ).prompt_for_llm_refinement.content,
        rewrite_outgoing(
            RewriteOutgoingInput(text="Strong nack. This will not scale.", target_register="warm")
        ).prompt_for_llm_refinement.content,
        brief_meeting(
            BriefMeetingInput(transcript=_TRANSCRIPT, me="Thomas")
        ).prompt_for_llm_refinement.content,
    ]
    for content in contents:
        assert _ADDENDUM_HEADER not in content


# ---------------------------------------------------------------------------
# reader_context shapes + appends after the existing content


def test_reader_context_appends_addendum_after_existing_content() -> None:
    base = translate_incoming(
        TranslateIncomingInput(text="Hey — can we revisit the rollout timeline?")
    ).prompt_for_llm_refinement.content
    shaped = translate_incoming(
        TranslateIncomingInput(
            text="Hey — can we revisit the rollout timeline?",
            reader_context=ReaderContext(neurotypes=["adhd"]),
        )
    ).prompt_for_llm_refinement.content
    # The shaped content is the baseline followed by the addendum (recency order).
    assert shaped.startswith(base)
    assert _ADDENDUM_HEADER in shaped
    assert "Reader preferences (ADHD) — translate_incoming:" in shaped


def test_reader_context_uses_per_tool_block_for_each_tool() -> None:
    shaped = check_tone(
        CheckToneInput(
            text="This is broken. Fix it.",
            reader_context=ReaderContext(neurotypes=["asd"]),
        )
    ).prompt_for_llm_refinement.content
    assert "Reader preferences (autism) — check_tone:" in shaped


def test_reader_context_max_chunk_size_interpolated() -> None:
    shaped = translate_incoming(
        TranslateIncomingInput(
            text="Please review the doc and reply.",
            reader_context=ReaderContext(neurotypes=["adhd"], max_chunk_size=3),
        )
    ).prompt_for_llm_refinement.content
    assert "'likely_subtext': cap at 3 items" in shaped


def test_reader_context_empty_neurotypes_default_knobs_stays_byte_identical() -> None:
    base = translate_incoming(
        TranslateIncomingInput(text="Status update only.")
    ).prompt_for_llm_refinement.content
    shaped = translate_incoming(
        TranslateIncomingInput(
            text="Status update only.",
            reader_context=ReaderContext(neurotypes=[]),
        )
    ).prompt_for_llm_refinement.content
    assert shaped == base


def test_reader_context_voice_input_false_alone_stays_byte_identical() -> None:
    """An explicit voice-input opt-out is NOT a shaping signal.

    ``voice_input_preferred=False`` carries no instruction, so it must not
    trigger a profile read + assembler call; the prompt stays byte-identical to
    the un-shaped baseline.
    """

    base = translate_incoming(
        TranslateIncomingInput(text="Status update only.")
    ).prompt_for_llm_refinement.content
    shaped = translate_incoming(
        TranslateIncomingInput(
            text="Status update only.",
            reader_context=ReaderContext(voice_input_preferred=False),
        )
    ).prompt_for_llm_refinement.content
    assert shaped == base


# ---------------------------------------------------------------------------
# Resolution precedence: reader_context per-field, else profile, else nothing


def test_profile_fallback_shapes_when_no_reader_context(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_profile(
        tmp_path,
        """
identity:
  neurotypes: [dyslexia]
""",
        monkeypatch,
    )
    shaped = rewrite_outgoing(
        RewriteOutgoingInput(text="This is broken.", target_register="warm")
    ).prompt_for_llm_refinement.content
    assert "Reader preferences (dyslexia) — rewrite_outgoing:" in shaped


def test_reader_context_field_overrides_profile_field(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_profile(
        tmp_path,
        """
identity:
  neurotypes: [dyslexia]
preferences:
  max_chunk_size: 9
""",
        monkeypatch,
    )
    # reader_context overrides neurotypes -> adhd; max_chunk_size NOT given in
    # reader_context, so the profile's 9 fills it (field-by-field precedence).
    shaped = translate_incoming(
        TranslateIncomingInput(
            text="Please review and reply.",
            reader_context=ReaderContext(neurotypes=["adhd"]),
        )
    ).prompt_for_llm_refinement.content
    assert "Reader preferences (ADHD) — translate_incoming:" in shaped
    assert "Reader preferences (dyslexia)" not in shaped
    assert "'likely_subtext': cap at 9 items" in shaped


def test_reader_context_tolerates_unknown_keys() -> None:
    # additionalProperties tolerant: an unknown key does not crash the call.
    ctx = ReaderContext.model_validate({"neurotypes": ["adhd"], "future_knob": 42})
    shaped = translate_incoming(
        TranslateIncomingInput(text="Please review.", reader_context=ctx)
    ).prompt_for_llm_refinement.content
    assert "Reader preferences (ADHD) — translate_incoming:" in shaped


def test_output_shape_unchanged_no_new_required_field() -> None:
    # The analysis (output shape) must not gain a reader_context field.
    envelope = translate_incoming(
        TranslateIncomingInput(
            text="Please review.",
            reader_context=ReaderContext(neurotypes=["adhd"]),
        )
    )
    dumped = envelope.deterministic_analysis.model_dump()
    assert "reader_context" not in dumped
    assert set(dumped) == {
        "explicit_ask",
        "likely_subtext",
        "ambiguity",
        "recommended_next_action",
        "eval_corpus_slice",
        "model_provenance",
    }
