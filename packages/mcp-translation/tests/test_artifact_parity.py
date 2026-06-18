# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Divergence guard: the artifact copy shipped inside the Python wheel MUST be
byte-identical to the canonical artifact in ``@neurodock/core``.

The Python assembler reads a copy of ``v1.json`` bundled as package-data (so the
wheel and the hosted-remote Worker both have it without a filesystem read of the
monorepo). That copy is only safe if it never drifts from core's source of
truth. This test fails the build the moment the two diverge — e.g. someone edits
core's artifact but forgets to re-copy it into the package.
"""

from __future__ import annotations

import json
from pathlib import Path

from neurodock_mcp_translation.addenda import (
    ARTIFACT_RESOURCE,
    load_artifact,
    load_artifact_text,
)

# packages/mcp-translation/tests/ -> repo root is parents[3].
_REPO_ROOT = Path(__file__).resolve().parents[3]
_CORE_ARTIFACT = _REPO_ROOT / "packages" / "core" / "data" / "neurotype-addenda" / "v1.json"


def test_packaged_artifact_is_byte_identical_to_core() -> None:
    core_text = _CORE_ARTIFACT.read_text(encoding="utf-8")
    packaged_text = load_artifact_text()
    assert packaged_text == core_text, (
        "The artifact copy bundled in mcp-translation has drifted from "
        f"{_CORE_ARTIFACT}. Re-copy core's v1.json into "
        f"src/neurodock_mcp_translation/data/{ARTIFACT_RESOURCE}."
    )


def test_packaged_artifact_parses_to_same_object_as_core() -> None:
    core_obj = json.loads(_CORE_ARTIFACT.read_text(encoding="utf-8"))
    assert load_artifact() == core_obj
