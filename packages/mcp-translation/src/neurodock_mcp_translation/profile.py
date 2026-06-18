# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Trimmed loader for ``~/.neurodock/profile.yaml`` (translation subset).

Ported from ``mcp-chronometric``'s proven profile reader (ADR 0012, R1 part B).
The translation server reads only the five fields that feed the per-neurotype
prompt-shaping addendum:

* ``identity.neurotypes``            — the reader's self-identified neurotypes.
* ``identity.additional_notes``      — free-form notes (the ``{notes}`` token).
* ``preferences.output_format``      — answer_first / conventional / bullet_first.
* ``preferences.max_chunk_size``     — per-list item cap (1..20).
* ``preferences.voice_input_preferred`` — R5 cross-cutting voice-input hint.

Discipline (identical to chronometric):

* A ``NEURODOCK_PROFILE_PATH`` env var overrides the default path so tests stay
  isolated from the user's filesystem.
* A missing or unparseable file degrades to a neutral safe default; the
  unparseable case logs ``profile_unreadable`` so the omission is visible.
* Every field is defensively parsed; a malformed value drops to ``None`` (or an
  empty list) rather than propagating.

The server stores nothing and emits no telemetry — this loader only *reads*.
Hosted-remote (``packages/remote``) has no home dir; ``load_profile`` simply
returns the safe default there, and shaping rides on ``reader_context`` instead.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

_LOG = logging.getLogger("neurodock_mcp_translation.profile")

DEFAULT_PROFILE_PATH = Path.home() / ".neurodock" / "profile.yaml"
PROFILE_PATH_ENV_VAR = "NEURODOCK_PROFILE_PATH"

# Canonical enums (mirror ``@neurodock/core``'s profile.ts). Self-ID only.
NEUROTYPES: frozenset[str] = frozenset(
    {"adhd", "asd", "audhd", "ocd", "dyslexia", "dyspraxia", "tourette", "other"}
)
OUTPUT_FORMATS: frozenset[str] = frozenset({"answer_first", "conventional", "bullet_first"})

# Profile-schema bounds for preferences.max_chunk_size.
_CHUNK_MIN = 1
_CHUNK_MAX = 20


@dataclass(frozen=True)
class TranslationProfile:
    """Subset of the user's profile relevant to translation prompt-shaping.

    All fields default to "absent"; an absent field means the corresponding
    ``reader_context`` field (or neutral absence) decides, so a profile carrying
    none of them yields today's un-shaped prompt.
    """

    neurotypes: list[str] = field(default_factory=list)
    output_format: str | None = None
    max_chunk_size: int | None = None
    voice_input_preferred: bool | None = None
    additional_notes: str | None = None


def profile_path() -> Path:
    override = os.environ.get(PROFILE_PATH_ENV_VAR)
    if override:
        return Path(override)
    return DEFAULT_PROFILE_PATH


def _safe_default() -> TranslationProfile:
    return TranslationProfile()


def _parse_neurotypes(value: Any) -> list[str]:
    """Keep only recognised neurotype enum members, in declaration order."""

    if not isinstance(value, list):
        return []
    out: list[str] = []
    for item in value:
        if isinstance(item, str) and item in NEUROTYPES:
            out.append(item)
    return out


def _parse_output_format(value: Any) -> str | None:
    if isinstance(value, str) and value in OUTPUT_FORMATS:
        return value
    return None


def _parse_chunk_size(value: Any) -> int | None:
    # bool is a subclass of int; reject it explicitly so True/False never leak.
    if isinstance(value, bool):
        return None
    if isinstance(value, int) and _CHUNK_MIN <= value <= _CHUNK_MAX:
        return value
    return None


def _parse_voice_input(value: Any) -> bool | None:
    return value if isinstance(value, bool) else None


def _parse_notes(value: Any) -> str | None:
    if isinstance(value, str) and value:
        return value
    return None


def load_profile() -> TranslationProfile:
    """Load the translation subset of the user profile.

    Returns a neutral safe default when the file is missing or unparseable. A
    structured warning is logged in the unparseable case so the omission is
    visible — never silent.
    """

    path = profile_path()
    if not path.exists():
        return _safe_default()

    try:
        with path.open("r", encoding="utf-8") as fp:
            data = yaml.safe_load(fp) or {}
    except (OSError, yaml.YAMLError) as exc:
        _LOG.warning(
            "profile_unreadable",
            extra={"event": "profile_unreadable", "error_type": type(exc).__name__},
        )
        return _safe_default()

    if not isinstance(data, dict):
        return _safe_default()

    identity = data.get("identity")
    identity = identity if isinstance(identity, dict) else {}
    preferences = data.get("preferences")
    preferences = preferences if isinstance(preferences, dict) else {}

    return TranslationProfile(
        neurotypes=_parse_neurotypes(identity.get("neurotypes")),
        output_format=_parse_output_format(preferences.get("output_format")),
        max_chunk_size=_parse_chunk_size(preferences.get("max_chunk_size")),
        voice_input_preferred=_parse_voice_input(preferences.get("voice_input_preferred")),
        additional_notes=_parse_notes(identity.get("additional_notes")),
    )
