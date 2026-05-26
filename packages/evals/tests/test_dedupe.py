# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""SimHash deduper tests."""

from __future__ import annotations

from neurodock_evals.dedupe import (
    NEAR_DUPLICATE_THRESHOLD,
    find_near_duplicates,
    fingerprint,
    hamming_distance,
)


def test_identical_texts_have_distance_zero() -> None:
    text = "Can we revisit the rollout timeline before next sprint please."
    assert hamming_distance(fingerprint(text), fingerprint(text)) == 0


def test_unrelated_texts_have_large_distance() -> None:
    a = fingerprint("The quick brown fox jumps over the lazy dog under a bright autumn moon.")
    b = fingerprint(
        "Database migrations should run in a separate transaction with idempotent steps."
    )
    assert hamming_distance(a, b) > 16


def test_near_paraphrase_flagged_at_threshold() -> None:
    """Tiny edit distance produces tiny Hamming distance, below the threshold."""

    a = "Can we revisit the rollout timeline before next sprint please."
    b = "Can we revisit the rollout timeline before next sprint please!"
    distance = hamming_distance(fingerprint(a), fingerprint(b))
    assert distance < NEAR_DUPLICATE_THRESHOLD


def test_find_near_duplicates_returns_pairs() -> None:
    texts = [
        ("a", "Can we revisit the rollout timeline before next sprint."),
        ("b", "Can we revisit the rollout timeline before next sprint!"),
        ("c", "Stack the database migrations behind a feature flag."),
    ]
    pairs = find_near_duplicates(texts)
    assert any({a, b} == {"a", "b"} for a, b, _ in pairs), (
        "a + b should be flagged as near-duplicates"
    )
    assert not any("c" in (a, b) for a, b, _ in pairs)
