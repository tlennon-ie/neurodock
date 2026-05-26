# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Scoring primitives for the eval harness.

Two kinds of score live here:

  1. `compare_expected` — field-level partial match between an example's
     `expected` block and a tool's actual deterministic output. Returns a
     0..1 score plus a list of `FieldDelta` describing each mismatch.

  2. `cohens_kappa` — inter-rater agreement for the multi-rater seed example
     and (in the future) any contributed example with three ratings.

`compare_expected` is intentionally lenient: the `expected` block names only
the fields the rater considered diagnostic. We score against THOSE fields
only; the actual envelope is allowed to carry extra fields.
"""

from __future__ import annotations

from typing import Any

from neurodock_evals.types import FieldDelta


def _flatten(prefix: str, value: Any) -> list[tuple[str, Any]]:
    """Flatten nested dicts/lists into (path, leaf) pairs.

    Lists are flattened positionally with `[i]` suffixes. Leaf values
    include `None`, bools, numbers, and strings. Dicts inside lists are
    recursed.
    """

    if isinstance(value, dict):
        out: list[tuple[str, Any]] = []
        for key, sub in value.items():
            sub_prefix = f"{prefix}.{key}" if prefix else key
            out.extend(_flatten(sub_prefix, sub))
        return out
    if isinstance(value, list):
        out_list: list[tuple[str, Any]] = []
        for idx, sub in enumerate(value):
            sub_prefix = f"{prefix}[{idx}]"
            out_list.extend(_flatten(sub_prefix, sub))
        # Also surface the list length so missing/extra items count.
        out_list.append((f"{prefix}.__len__", len(value)))
        return out_list
    return [(prefix, value)]


def _path_get(payload: Any, path: str) -> tuple[bool, Any]:
    """Walk a flattened path against the actual payload.

    Returns (found, value). When the path doesn't resolve, returns (False, None).
    """

    if not path:
        return True, payload
    cursor: Any = payload
    parts = path.split(".")
    for part in parts:
        if part.endswith("]") and "[" in part:
            key, _, idx_str = part.partition("[")
            idx = int(idx_str.rstrip("]"))
            if key:
                if not isinstance(cursor, dict) or key not in cursor:
                    return False, None
                cursor = cursor[key]
            if not isinstance(cursor, list) or idx >= len(cursor):
                return False, None
            cursor = cursor[idx]
            continue
        if part == "__len__":
            if isinstance(cursor, list):
                return True, len(cursor)
            return False, None
        if not isinstance(cursor, dict) or part not in cursor:
            return False, None
        cursor = cursor[part]
    return True, cursor


def _values_match(expected: Any, actual: Any) -> bool:
    """Compare two leaves with tolerance for numeric drift and span overlap."""

    if expected is None:
        return actual is None
    if isinstance(expected, bool):
        return bool(expected == actual)
    if isinstance(expected, int | float) and isinstance(actual, int | float):
        return abs(float(expected) - float(actual)) < 0.5
    if isinstance(expected, str) and isinstance(actual, str):
        return expected.strip().lower() == actual.strip().lower()
    return bool(expected == actual)


def compare_expected(
    expected: dict[str, Any],
    actual: dict[str, Any],
) -> tuple[float, list[FieldDelta]]:
    """Return (score, deltas) for partial matching of expected against actual.

    Score is the fraction of expected leaves that matched. An empty expected
    block scores 1.0 by convention (nothing to test, nothing fails).
    """

    leaves = _flatten("", expected)
    if not leaves:
        return 1.0, []
    matches = 0
    deltas: list[FieldDelta] = []
    for path, expected_value in leaves:
        found, actual_value = _path_get(actual, path)
        if found and _values_match(expected_value, actual_value):
            matches += 1
        else:
            deltas.append(
                FieldDelta(
                    path=path,
                    expected=expected_value,
                    actual=actual_value if found else None,
                )
            )
    return matches / len(leaves), deltas


def cohens_kappa(rater_a: list[int], rater_b: list[int]) -> float:
    """Cohen's kappa for two raters on a discrete labelling task.

    Both lists MUST be the same length. Labels are arbitrary hashable ints;
    we count observed vs chance agreement.
    """

    if len(rater_a) != len(rater_b):
        raise ValueError("Rater lists must be the same length")
    if not rater_a:
        return 1.0
    total = len(rater_a)
    observed = sum(1 for a, b in zip(rater_a, rater_b, strict=True) if a == b) / total
    labels = set(rater_a) | set(rater_b)
    a_counts = {label: rater_a.count(label) / total for label in labels}
    b_counts = {label: rater_b.count(label) / total for label in labels}
    expected = sum(a_counts[label] * b_counts[label] for label in labels)
    if expected >= 1.0:
        return 1.0
    return (observed - expected) / (1.0 - expected)
