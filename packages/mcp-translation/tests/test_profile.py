# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Tests for the trimmed profile reader (ported from mcp-chronometric)."""

from __future__ import annotations

from pathlib import Path

import pytest
from neurodock_mcp_translation.profile import (
    PROFILE_PATH_ENV_VAR,
    TranslationProfile,
    load_profile,
    profile_path,
)


def _write_profile(tmp_path: Path, body: str, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "profile.yaml"
    path.write_text(body, encoding="utf-8")
    monkeypatch.setenv(PROFILE_PATH_ENV_VAR, str(path))
    return path


def test_missing_file_returns_safe_default(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(PROFILE_PATH_ENV_VAR, str(tmp_path / "nope.yaml"))
    profile = load_profile()
    assert profile == TranslationProfile()
    assert profile.neurotypes == []
    assert profile.output_format is None
    assert profile.max_chunk_size is None
    assert profile.voice_input_preferred is None
    assert profile.additional_notes is None


def test_env_var_overrides_default_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(PROFILE_PATH_ENV_VAR, "/tmp/elsewhere/profile.yaml")
    assert profile_path() == Path("/tmp/elsewhere/profile.yaml")


def test_reads_all_relevant_fields(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write_profile(
        tmp_path,
        """
identity:
  display_name: Thomas
  neurotypes: [adhd, asd]
  additional_notes: Please quote the source.
preferences:
  output_format: bullet_first
  max_chunk_size: 3
  voice_input_preferred: true
""",
        monkeypatch,
    )
    profile = load_profile()
    assert profile.neurotypes == ["adhd", "asd"]
    assert profile.additional_notes == "Please quote the source."
    assert profile.output_format == "bullet_first"
    assert profile.max_chunk_size == 3
    assert profile.voice_input_preferred is True


def test_unparseable_yaml_returns_safe_default(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_profile(tmp_path, "identity: [unbalanced\n", monkeypatch)
    assert load_profile() == TranslationProfile()


def test_unknown_neurotypes_are_dropped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write_profile(
        tmp_path,
        """
identity:
  neurotypes: [adhd, not_a_type, "", 5, asd]
""",
        monkeypatch,
    )
    profile = load_profile()
    assert profile.neurotypes == ["adhd", "asd"]


def test_unknown_output_format_is_ignored(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write_profile(
        tmp_path,
        """
preferences:
  output_format: rainbow
""",
        monkeypatch,
    )
    assert load_profile().output_format is None


def test_out_of_range_chunk_size_is_ignored(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_profile(
        tmp_path,
        """
preferences:
  max_chunk_size: 99
""",
        monkeypatch,
    )
    assert load_profile().max_chunk_size is None


def test_chunk_size_bool_is_rejected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write_profile(
        tmp_path,
        """
preferences:
  max_chunk_size: true
""",
        monkeypatch,
    )
    assert load_profile().max_chunk_size is None


def test_voice_input_non_bool_is_ignored(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _write_profile(
        tmp_path,
        """
preferences:
  voice_input_preferred: "yes"
""",
        monkeypatch,
    )
    assert load_profile().voice_input_preferred is None


def test_non_mapping_top_level_returns_safe_default(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_profile(tmp_path, "- just\n- a\n- list\n", monkeypatch)
    assert load_profile() == TranslationProfile()


def test_empty_additional_notes_becomes_none(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _write_profile(
        tmp_path,
        """
identity:
  additional_notes: ""
""",
        monkeypatch,
    )
    assert load_profile().additional_notes is None
