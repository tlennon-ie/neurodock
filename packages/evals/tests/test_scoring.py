# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Scoring primitives — partial-match scorer and Cohen's kappa."""

from __future__ import annotations

import pytest
from neurodock_evals.scoring import cohens_kappa, compare_expected


def test_compare_expected_perfect_match() -> None:
    score, deltas = compare_expected(
        {"explicit_ask": None, "ambiguity": {"detected": True}},
        {"explicit_ask": None, "ambiguity": {"detected": True, "spans": []}},
    )
    assert score == 1.0
    assert deltas == []


def test_compare_expected_handles_missing_field() -> None:
    score, deltas = compare_expected(
        {"explicit_ask": "x", "ambiguity": {"detected": True}},
        {"explicit_ask": "y", "ambiguity": {"detected": False}},
    )
    assert score < 1.0
    paths = {delta.path for delta in deltas}
    assert "explicit_ask" in paths
    assert "ambiguity.detected" in paths


def test_compare_expected_list_length_via_len_pseudokey() -> None:
    score, _deltas = compare_expected(
        {"flagged_phrases": {"__len__": 2}},
        {"flagged_phrases": [{}, {}]},
    )
    assert score == 1.0


def test_compare_expected_empty_expected_block_is_pass() -> None:
    score, deltas = compare_expected({}, {"anything": "at all"})
    assert score == 1.0
    assert deltas == []


def test_cohens_kappa_identical_raters() -> None:
    assert cohens_kappa([0, 1, 0, 1, 1], [0, 1, 0, 1, 1]) == 1.0


def test_cohens_kappa_uncorrelated_raters_low() -> None:
    # Two raters whose agreement matches chance produce kappa near zero.
    kappa = cohens_kappa([0, 1, 0, 1, 0, 1], [1, 0, 1, 0, 1, 0])
    assert kappa < 0.0  # Worse than chance


def test_cohens_kappa_length_mismatch_raises() -> None:
    with pytest.raises(ValueError):
        cohens_kappa([0, 1], [0])
