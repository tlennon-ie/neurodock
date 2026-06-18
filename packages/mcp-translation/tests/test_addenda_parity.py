# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""The Python half of the cross-language parity gate (ADR 0012 binding rule 2).

The TypeScript assembler is the source of truth; it generates the ``expected``
strings in ``packages/core/data/neurotype-addenda/parity-fixtures.json`` and the
TS test (``packages/core/src/neurotype-addenda.parity.test.ts``) guards them. THIS
test asserts the Python assembler reproduces those same strings byte-for-byte.

If TS and Python ever diverge, exactly one of the two halves goes red — drift is
a failed build, not a user report. The TS test runs in the TypeScript CI job; this
test runs in the Python/eval CI job, so the cross-product is checked on both
toolchains.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from neurodock_mcp_translation.addenda import (
    AssembleOptions,
    assemble_neurotype_addendum,
    load_artifact,
)

# packages/mcp-translation/tests/ -> repo root is parents[3].
_REPO_ROOT = Path(__file__).resolve().parents[3]
_FIXTURES = _REPO_ROOT / "packages" / "core" / "data" / "neurotype-addenda" / "parity-fixtures.json"


def _load_fixtures() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(_FIXTURES.read_text(encoding="utf-8"))
    return data


_FIXTURE_DATA = _load_fixtures()
_CASES: list[dict[str, Any]] = _FIXTURE_DATA["cases"]


def _options_for(case: dict[str, Any]) -> AssembleOptions:
    # Fixture inputs use language-neutral snake_case keys (same as the Python
    # options field names), so this maps one-to-one.
    return AssembleOptions(
        tool=case.get("tool"),
        neurotypes=list(case["neurotypes"]),
        output_format=case.get("output_format"),
        max_chunk_size=case["max_chunk_size"],
        voice_input_preferred=case.get("voice_input_preferred"),
        additional_notes=case.get("additional_notes"),
    )


def test_fixture_corpus_is_non_trivial_and_pinned() -> None:
    artifact = load_artifact()
    # 59 cases exist; a floor of 55 catches accidental truncation of the corpus.
    assert len(_CASES) >= 55
    assert _FIXTURE_DATA["artifact_version"] == artifact["artifact_version"]


@pytest.mark.parametrize("case", _CASES, ids=[c["name"] for c in _CASES])
def test_python_assembler_matches_ts_fixture(case: dict[str, Any]) -> None:
    artifact = load_artifact()
    produced = assemble_neurotype_addendum(artifact, _options_for(case))
    assert produced == case["expected"], (
        f"Python assembler diverged from the TS source of truth for case {case['name']!r}."
    )
