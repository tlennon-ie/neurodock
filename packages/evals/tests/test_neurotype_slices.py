# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""R6 — per-neurotype eval slices.

The neurotype tag is a *cross-cutting* dimension layered on top of the existing
tool slices (ADR 0011 additive discipline). An example MAY declare the
neurotype(s) it targets via an optional top-level `neurotypes` array using the
canonical profile enum. The harness aggregates and reports a score per
neurotype slice in addition to the per-tool slices.

Back-compat is load-bearing: an example with no `neurotypes` tag must still
load, validate, and score exactly as before.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from neurodock_evals.corpus import iter_slices, load_slice
from neurodock_evals.harness import SLICE_TO_TOOL, main
from neurodock_evals.runner import run_example
from neurodock_evals.scoring import neurotype_scores
from neurodock_evals.types import (
    ConsentBlock,
    CorpusExample,
    NeurotypeScore,
    RunResult,
    SliceScore,
)
from pydantic import ValidationError

# The canonical profile enum (packages/core/schemas/profile.schema.json).
CANONICAL_NEUROTYPES = (
    "adhd",
    "asd",
    "audhd",
    "ocd",
    "dyslexia",
    "dyspraxia",
    "tourette",
    "other",
)

# The seven neurotypes that have extension addendum blocks and therefore get
# seed coverage in this release.
SEEDED_NEUROTYPES = (
    "adhd",
    "asd",
    "audhd",
    "ocd",
    "dyslexia",
    "dyspraxia",
    "tourette",
)

NEUROTYPE_SLICE = "translation/neurotype"


# ---------------------------------------------------------------------------
# Schema extension: additive + optional
# ---------------------------------------------------------------------------


def test_example_model_neurotypes_defaults_empty() -> None:
    """An example with no `neurotypes` field parses with an empty list."""

    example = CorpusExample.model_validate(
        {
            "id": "x.untagged.001",
            "slice": "translation/incoming",
            "created_at": "2026-06-18",
            "consent": {
                "contributor": "synth-curator-001",
                "consent_token": "sha256:test-untagged",
                "anonymisation_pass": 1,
            },
            "status": "synthesised",
            "license": "AGPL-3.0-or-later",
            "input": {"text": "I'll circle back next week."},
            "expected": {"ambiguity": {"detected": True}},
        }
    )
    assert example.neurotypes == []


def test_example_model_accepts_canonical_neurotypes() -> None:
    example = CorpusExample.model_validate(
        {
            "id": "x.tagged.001",
            "slice": "translation/neurotype",
            "created_at": "2026-06-18",
            "consent": {
                "contributor": "synth-curator-001",
                "consent_token": "sha256:test-tagged",
                "anonymisation_pass": 1,
            },
            "status": "synthesised",
            "license": "AGPL-3.0-or-later",
            "neurotypes": ["dyslexia", "adhd"],
            "input": {"text": "I'll circle back next week."},
            "expected": {"ambiguity": {"detected": True}},
        }
    )
    assert example.neurotypes == ["dyslexia", "adhd"]


def test_example_model_rejects_duplicate_neurotypes() -> None:
    """Programmatic construction must enforce the schema's uniqueItems contract.

    The JSON Schema rejects duplicate `neurotypes` (uniqueItems: true), but a
    model built in code bypasses the schema. A duplicate would double-count the
    example in `neurotype_scores`, so the Pydantic layer rejects it too.
    """

    with pytest.raises(ValidationError, match="neurotypes must be unique"):
        CorpusExample(
            id="x.dupe.001",
            slice="translation/neurotype",
            created_at="2026-06-18",
            consent=ConsentBlock(
                contributor="synth-curator-001",
                consent_token="sha256:test-dupe",
                anonymisation_pass=1,
            ),
            status="synthesised",
            license="AGPL-3.0-or-later",
            neurotypes=["adhd", "adhd"],
            input={"text": "x"},
            expected={},
        )


def test_example_model_rejects_duplicate_neurotypes_via_validate() -> None:
    """Same contract, enforced when validating a raw mapping (the load path)."""

    with pytest.raises(ValidationError, match="neurotypes must be unique"):
        CorpusExample.model_validate(
            {
                "id": "x.dupe.002",
                "slice": "translation/neurotype",
                "created_at": "2026-06-18",
                "consent": {
                    "contributor": "synth-curator-001",
                    "consent_token": "sha256:test-dupe-2",
                    "anonymisation_pass": 1,
                },
                "status": "synthesised",
                "license": "AGPL-3.0-or-later",
                "neurotypes": ["dyslexia", "dyslexia"],
                "input": {"text": "x"},
                "expected": {},
            }
        )


def test_existing_seed_examples_still_load_without_neurotypes() -> None:
    """Back-compat: the original tool slices carry no neurotype tag and still load."""

    for slice_id in (
        "translation/incoming",
        "translation/tone",
        "translation/outgoing",
        "translation/meetings",
    ):
        examples = load_slice(slice_id)
        assert examples, f"{slice_id} must still load"
        # None of the original seeds declare a neurotype tag.
        for example in examples:
            assert example.neurotypes == []


# ---------------------------------------------------------------------------
# Two-enum coexistence boundary
# ---------------------------------------------------------------------------


def test_canonical_neurotypes_and_rater_enum_coexist() -> None:
    """The example-level tag and the rater self-ID are intentionally separate.

    `CorpusExample.neurotypes` uses the CANONICAL profile enum (`dyslexia`),
    while a rater annotation's `rater_neurotypes` uses the older v0.0.1 rater
    enum (`dyslexic`). The two enums are different fields with different value
    sets and must NOT conflict — an example can legitimately carry both.
    """

    example = CorpusExample.model_validate(
        {
            "id": "x.coexist.001",
            "slice": "translation/neurotype",
            "created_at": "2026-06-18",
            "consent": {
                "contributor": "synth-curator-001",
                "consent_token": "sha256:test-coexist",
                "anonymisation_pass": 1,
            },
            "status": "synthesised",
            "license": "AGPL-3.0-or-later",
            # Canonical profile enum on the example.
            "neurotypes": ["dyslexia"],
            "input": {"text": "Let me circle back after I reread the thread."},
            "expected": {"ambiguity": {"detected": True}},
            "ratings": [
                {
                    "rater_id": "rater-curator-A",
                    # Older v0.0.1 rater enum value — deliberately different.
                    "rater_neurotypes": ["dyslexic"],
                    "agreement_with_expected": 0.9,
                }
            ],
        }
    )

    # Example-level tag stays canonical; rater self-ID stays on the v0.0.1 enum.
    assert example.neurotypes == ["dyslexia"]
    assert example.ratings[0].rater_neurotypes == ["dyslexic"]
    # The two fields are distinct: the canonical value is NOT a valid rater value
    # and vice versa, which is exactly why they are kept separate.
    assert example.neurotypes[0] != example.ratings[0].rater_neurotypes[0]


def test_rater_enum_rejects_canonical_value() -> None:
    """Guards the boundary: the canonical `dyslexia` is NOT a valid rater value.

    If the two fields were accidentally collapsed onto one enum, feeding the
    canonical profile value into `rater_neurotypes` would start to pass. It
    must keep failing — the rater enum predates and differs from the profile
    enum on purpose (see the 0.0.3 "Known follow-up" note).
    """

    with pytest.raises(ValidationError):
        CorpusExample.model_validate(
            {
                "id": "x.coexist.002",
                "slice": "translation/neurotype",
                "created_at": "2026-06-18",
                "consent": {
                    "contributor": "synth-curator-001",
                    "consent_token": "sha256:test-coexist-2",
                    "anonymisation_pass": 1,
                },
                "status": "synthesised",
                "license": "AGPL-3.0-or-later",
                "neurotypes": ["dyslexia"],
                "input": {"text": "x"},
                "expected": {},
                "ratings": [
                    {
                        "rater_id": "rater-curator-A",
                        # Canonical value in the rater field is invalid.
                        "rater_neurotypes": ["dyslexia"],
                        "agreement_with_expected": 0.9,
                    }
                ],
            }
        )


# ---------------------------------------------------------------------------
# Score-model defensive constraints
# ---------------------------------------------------------------------------


def test_neurotype_score_accepts_valid_counts() -> None:
    score = NeurotypeScore(neurotype="adhd", total=2, passed=1, mean_score=0.5)
    assert score.passed <= score.total


def test_neurotype_score_rejects_negative_total() -> None:
    with pytest.raises(ValidationError):
        NeurotypeScore(neurotype="adhd", total=-1, passed=0, mean_score=0.0)


def test_neurotype_score_rejects_negative_passed() -> None:
    with pytest.raises(ValidationError):
        NeurotypeScore(neurotype="adhd", total=1, passed=-1, mean_score=0.0)


def test_neurotype_score_rejects_passed_exceeding_total() -> None:
    with pytest.raises(ValidationError, match=r"passed .* cannot exceed total"):
        NeurotypeScore(neurotype="adhd", total=1, passed=2, mean_score=1.0)


def test_neurotype_score_rejects_out_of_range_mean() -> None:
    with pytest.raises(ValidationError):
        NeurotypeScore(neurotype="adhd", total=1, passed=1, mean_score=1.5)


def test_slice_score_accepts_valid_counts() -> None:
    score = SliceScore(
        slice="translation/incoming",
        tool="translate_incoming",
        total=3,
        passed=2,
        mean_score=0.7,
    )
    assert score.passed <= score.total


def test_slice_score_rejects_negative_total() -> None:
    with pytest.raises(ValidationError):
        SliceScore(
            slice="translation/incoming",
            tool="translate_incoming",
            total=-1,
            passed=0,
            mean_score=0.0,
        )


def test_slice_score_rejects_negative_passed() -> None:
    with pytest.raises(ValidationError):
        SliceScore(
            slice="translation/incoming",
            tool="translate_incoming",
            total=1,
            passed=-1,
            mean_score=0.0,
        )


def test_slice_score_rejects_passed_exceeding_total() -> None:
    with pytest.raises(ValidationError, match=r"passed .* cannot exceed total"):
        SliceScore(
            slice="translation/incoming",
            tool="translate_incoming",
            total=1,
            passed=2,
            mean_score=1.0,
        )


# ---------------------------------------------------------------------------
# Per-neurotype aggregation
# ---------------------------------------------------------------------------


def _result(example_id: str, slice_id: str, score: float, passed: bool) -> RunResult:
    return RunResult(
        example_id=example_id,
        slice=slice_id,
        tool="translate_incoming",
        passed=passed,
        score=score,
        schema_valid=True,
    )


def test_neurotype_scores_groups_by_tag() -> None:
    examples = [
        CorpusExample.model_validate(
            {
                "id": "x.a.001",
                "slice": "translation/neurotype",
                "created_at": "2026-06-18",
                "consent": {
                    "contributor": "synth-curator-001",
                    "consent_token": "sha256:a",
                    "anonymisation_pass": 1,
                },
                "status": "synthesised",
                "license": "AGPL-3.0-or-later",
                "neurotypes": ["adhd", "audhd"],
                "input": {"text": "x"},
                "expected": {},
            }
        ),
        CorpusExample.model_validate(
            {
                "id": "x.b.001",
                "slice": "translation/neurotype",
                "created_at": "2026-06-18",
                "consent": {
                    "contributor": "synth-curator-001",
                    "consent_token": "sha256:b",
                    "anonymisation_pass": 1,
                },
                "status": "synthesised",
                "license": "AGPL-3.0-or-later",
                "neurotypes": ["adhd"],
                "input": {"text": "y"},
                "expected": {},
            }
        ),
    ]
    results = [
        _result("x.a.001", "translation/neurotype", 1.0, True),
        _result("x.b.001", "translation/neurotype", 0.0, False),
    ]
    scores = neurotype_scores(results, examples)
    by_type = {s.neurotype: s for s in scores}
    assert set(by_type) == {"adhd", "audhd"}
    # adhd covers both examples; mean = 0.5, 1 of 2 passed.
    assert by_type["adhd"].total == 2
    assert by_type["adhd"].passed == 1
    assert by_type["adhd"].mean_score == pytest.approx(0.5)
    # audhd covers only the first example.
    assert by_type["audhd"].total == 1
    assert by_type["audhd"].passed == 1
    assert by_type["audhd"].mean_score == pytest.approx(1.0)


def test_neurotype_scores_ignores_untagged_examples() -> None:
    examples = [
        CorpusExample.model_validate(
            {
                "id": "x.untagged.001",
                "slice": "translation/incoming",
                "created_at": "2026-06-18",
                "consent": {
                    "contributor": "synth-curator-001",
                    "consent_token": "sha256:u",
                    "anonymisation_pass": 1,
                },
                "status": "synthesised",
                "license": "AGPL-3.0-or-later",
                "input": {"text": "x"},
                "expected": {},
            }
        ),
    ]
    results = [_result("x.untagged.001", "translation/incoming", 1.0, True)]
    assert neurotype_scores(results, examples) == []


# ---------------------------------------------------------------------------
# Seed slice
# ---------------------------------------------------------------------------


def test_neurotype_slice_is_bound_to_a_tool() -> None:
    assert SLICE_TO_TOOL[NEUROTYPE_SLICE] == "translate_incoming"


def test_neurotype_slice_loads_and_is_discovered() -> None:
    assert NEUROTYPE_SLICE in set(iter_slices())
    examples = load_slice(NEUROTYPE_SLICE)
    assert examples, "neurotype slice must have at least one seed example"
    for example in examples:
        assert example.slice == NEUROTYPE_SLICE
        assert example.status == "synthesised"
        assert example.license == "AGPL-3.0-or-later"
        assert example.consent.consent_token.startswith("sha256:")
        assert example.neurotypes, f"{example.id} must declare at least one neurotype"
        assert example.ratings, f"{example.id} must carry at least one rater annotation"


@pytest.mark.parametrize("neurotype", SEEDED_NEUROTYPES)
def test_each_seeded_neurotype_has_examples(neurotype: str) -> None:
    examples = load_slice(NEUROTYPE_SLICE)
    matching = [ex for ex in examples if neurotype in ex.neurotypes]
    assert len(matching) >= 2, f"{neurotype} should have at least two seed examples"


def test_neurotype_seeds_pass_the_baseline() -> None:
    """Seeds are calibrated to clear the default threshold against the baseline."""

    for example in load_slice(NEUROTYPE_SLICE):
        result = run_example(example, tool_name="translate_incoming")
        assert result.schema_valid, f"{example.id}: input failed validation"
        assert result.error is None, f"{example.id}: runner raised {result.error}"
        assert result.passed, f"{example.id}: score={result.score:.3f} deltas={result.deltas!r}"


# ---------------------------------------------------------------------------
# Harness CI wiring + reporting
# ---------------------------------------------------------------------------


def test_ci_run_includes_neurotype_slice_and_reports_neurotype_scores(tmp_path: Path) -> None:
    exit_code = main(["--ci", "--reports-dir", str(tmp_path)])
    assert exit_code == 0
    report_path = next(tmp_path.glob("*.json"))
    payload = json.loads(report_path.read_text(encoding="utf-8"))

    slice_ids = {entry["slice"] for entry in payload["slices"]}
    assert NEUROTYPE_SLICE in slice_ids

    assert "neurotype_scores" in payload, "report must carry the per-neurotype aggregation"
    reported = {entry["neurotype"] for entry in payload["neurotype_scores"]}
    for neurotype in SEEDED_NEUROTYPES:
        assert neurotype in reported, f"{neurotype} slice must be reported"


def _string_leaves(value: object) -> list[str]:
    """Collect every string leaf in a nested dict/list (cheap, no deps)."""

    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        out: list[str] = []
        for sub in value.values():
            out.extend(_string_leaves(sub))
        return out
    if isinstance(value, list):
        out_list: list[str] = []
        for sub in value:
            out_list.extend(_string_leaves(sub))
        return out_list
    return []


def test_neurotype_report_does_not_leak_example_text(tmp_path: Path) -> None:
    exit_code = main(["--corpus", NEUROTYPE_SLICE, "--reports-dir", str(tmp_path)])
    assert exit_code == 0
    report_path = next(tmp_path.glob("*.json"))
    text = report_path.read_text(encoding="utf-8").lower()
    # The per-neurotype aggregation must contain neurotype labels + scores only.
    #
    # Scope: this scans the verbatim user content in `input.text` (the only raw
    # message field any current translation tool exposes). It additionally scans
    # string leaves in the `expected` block defensively — by convention the
    # `expected` block carries rater TARGETS (enums, booleans, short labels), not
    # verbatim user text, so this is cheap and should never trip; if it does, a
    # seed has leaked source text into `expected` and must be fixed.
    for example in load_slice(NEUROTYPE_SLICE):
        body = example.input.get("text", "")
        assert isinstance(body, str)
        assert body.lower() not in text, f"{example.id} body leaked into report"
        for leaf in _string_leaves(example.expected):
            # Skip trivially-short labels (enum values like "high") that could
            # coincidentally appear inside score/label tokens; only non-trivial
            # strings would indicate a genuine verbatim-text leak.
            if len(leaf) >= 12:
                assert leaf.lower() not in text, f"{example.id} expected-leaf leaked into report"
