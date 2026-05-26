# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Load + validate every seed example shipped with v0.0.1."""

from __future__ import annotations

import pytest
from neurodock_evals.corpus import iter_slices, load_slice

SEED_SLICES = (
    "translation/incoming",
    "translation/tone",
    "translation/outgoing",
    "translation/meetings",
)


@pytest.mark.parametrize("slice_id", SEED_SLICES)
def test_seed_slice_loads(slice_id: str) -> None:
    examples = load_slice(slice_id)
    assert examples, f"slice {slice_id} should have at least one seed example"
    for example in examples:
        assert example.slice == slice_id
        assert example.status == "synthesised", "All v0.0.1 seeds are synthesised, not contributed"
        assert example.license == "AGPL-3.0-or-later"
        assert example.consent.consent_token.startswith("sha256:")
        assert example.ratings, f"{example.id} should carry at least one rater annotation"


def test_iter_slices_discovers_seed_slices() -> None:
    found = set(iter_slices())
    for slice_id in SEED_SLICES:
        assert slice_id in found


def test_seed_corpus_has_nine_examples() -> None:
    """v0.0.1 ships nine hand-authored examples across the four slices."""

    total = sum(len(load_slice(slice_id)) for slice_id in SEED_SLICES)
    assert total == 9
