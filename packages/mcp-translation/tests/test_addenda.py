# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for the Python neurotype-addenda assembler.

These mirror the TypeScript assembler's unit tests
(``packages/core/src/neurotype-addenda.test.ts``) so the two ports stay aligned
at the unit level. The byte-for-byte cross-language guarantee is proven
separately by ``test_addenda_parity.py``.
"""

from __future__ import annotations

from neurodock_mcp_translation.addenda import (
    AssembleOptions,
    assemble_neurotype_addendum,
    load_artifact,
)


def _assemble(
    *,
    neurotypes: list[str] | None = None,
    output_format: str | None = "answer_first",
    max_chunk_size: int = 5,
    tool: str | None = None,
    voice_input_preferred: bool | None = None,
    additional_notes: str | None = None,
) -> str:
    options = AssembleOptions(
        neurotypes=neurotypes if neurotypes is not None else [],
        max_chunk_size=max_chunk_size,
        tool=tool,
        output_format=output_format,
        voice_input_preferred=voice_input_preferred,
        additional_notes=additional_notes,
    )
    return assemble_neurotype_addendum(load_artifact(), options)


# ---------------------------------------------------------------------------
# Empty gate


def test_empty_all_default_returns_empty_string() -> None:
    assert _assemble() == ""


def test_non_default_output_format_alone_triggers_addendum() -> None:
    assert _assemble(output_format="bullet_first") != ""


def test_voice_input_flag_alone_triggers_addendum() -> None:
    assert _assemble(voice_input_preferred=True) != ""


def test_notes_alone_trigger_addendum() -> None:
    assert _assemble(additional_notes="always quote the source") != ""


# ---------------------------------------------------------------------------
# Fusion (AuDHD)


def test_adhd_plus_asd_fuse_to_audhd() -> None:
    out = _assemble(neurotypes=["adhd", "asd"])
    assert "Reader preferences (AuDHD)" in out
    assert "Reader preferences (ADHD)" not in out
    assert "Reader preferences (autism)" not in out


def test_audhd_declared_directly_uses_audhd_block() -> None:
    out = _assemble(neurotypes=["audhd"])
    assert "Reader preferences (AuDHD)" in out


def test_tourette_plus_audhd_keeps_tourette_drops_raw_adhd() -> None:
    out = _assemble(neurotypes=["tourette", "adhd", "asd"])
    assert "Reader preferences (Tourette)" in out
    assert "Reader preferences (AuDHD)" in out
    assert "Reader preferences (ADHD):" not in out


# ---------------------------------------------------------------------------
# Priority ordering


def test_dyslexia_is_placed_before_adhd() -> None:
    out = _assemble(neurotypes=["adhd", "dyslexia"])
    dyslexia_idx = out.index("Reader preferences (dyslexia)")
    adhd_idx = out.index("Reader preferences (ADHD)")
    assert dyslexia_idx < adhd_idx


def test_other_is_always_last() -> None:
    out = _assemble(
        neurotypes=["adhd", "other"],
        additional_notes="Always start with 'Heads up:'",
    )
    adhd_idx = out.index("Reader preferences (ADHD)")
    other_idx = out.index("Reader preferences (self-described)")
    assert adhd_idx < other_idx


# ---------------------------------------------------------------------------
# Per-tool vs generic fallback


def test_per_tool_block_used_when_tool_supplied() -> None:
    out = _assemble(neurotypes=["adhd"], tool="translate_incoming")
    assert "Reader preferences (ADHD) — translate_incoming:" in out


def test_generic_fallback_used_without_tool() -> None:
    out = _assemble(neurotypes=["adhd"])
    assert "Reader preferences (ADHD):" in out
    assert "first phrase" in out


def test_unknown_tool_falls_back_to_generic() -> None:
    out = _assemble(neurotypes=["adhd"], tool="no_such_tool")
    assert "Reader preferences (ADHD):" in out


# ---------------------------------------------------------------------------
# Token interpolation


def test_max_chunk_size_interpolated_into_generic_block() -> None:
    out = _assemble(neurotypes=["adhd"], max_chunk_size=3)
    assert "Cap any list you return at 3 items" in out
    assert "{max_chunk_size}" not in out


def test_max_chunk_size_interpolated_into_per_tool_block() -> None:
    out = _assemble(neurotypes=["adhd"], tool="translate_incoming", max_chunk_size=7)
    assert "'likely_subtext': cap at 7 items" in out
    assert "{max_chunk_size}" not in out


def test_notes_interpolated_into_self_described_block() -> None:
    out = _assemble(
        neurotypes=["other"],
        additional_notes="Please always quote the source verbatim.",
    )
    assert "Reader preferences (self-described)" in out
    assert "Please always quote the source verbatim." in out
    assert "{notes}" not in out


def test_notes_appended_as_footer_when_other_not_selected() -> None:
    out = _assemble(
        neurotypes=["adhd"],
        additional_notes="Use kelvin not celsius for temperatures.",
    )
    assert "Reader preferences (ADHD)" in out
    assert "Use kelvin not celsius for temperatures." in out


# ---------------------------------------------------------------------------
# Voice-input gating


def test_voice_input_emits_single_block_instruction() -> None:
    out = _assemble(output_format="bullet_first", voice_input_preferred=True)
    assert "single, copy-pasteable block" in out


def test_voice_input_not_emitted_when_false() -> None:
    out = _assemble(neurotypes=["adhd"], voice_input_preferred=False)
    assert "Reader preferences (ADHD)" in out
    assert "copy-pasteable block" not in out


def test_voice_input_not_emitted_when_unset() -> None:
    out = _assemble(neurotypes=["adhd"])
    assert "copy-pasteable block" not in out


# ---------------------------------------------------------------------------
# Conflict footer


def test_conflict_footer_appended_for_three_plus() -> None:
    out = _assemble(neurotypes=["adhd", "dyslexia", "ocd"])
    assert "prefer the more conservative reading: shorter, more concrete" in out


def test_conflict_footer_not_appended_for_fewer_than_three() -> None:
    out = _assemble(neurotypes=["adhd", "dyslexia"])
    assert "prefer the more conservative reading" not in out


# ---------------------------------------------------------------------------
# Purity / defensiveness


def test_does_not_mutate_input_neurotypes() -> None:
    neurotypes = ["adhd", "asd"]
    _assemble(neurotypes=neurotypes)
    assert neurotypes == ["adhd", "asd"]


def test_unknown_neurotype_is_skipped_not_crashed() -> None:
    # A neurotype with no block (and not tourette/other) renders nothing.
    out = _assemble(neurotypes=["adhd", "not_a_real_type"])
    assert "Reader preferences (ADHD)" in out
