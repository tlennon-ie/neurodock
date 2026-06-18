# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Unit tests for ``decompose``."""

from __future__ import annotations

from typing import Any

import pytest
from neurodock_mcp_task_fractionator.decomposer import (
    BudgetInfeasibleError,
    DecompositionUnavailableError,
    GoalRequiredError,
    GoalTooLongError,
    MaxChunkSizeInvalidError,
    TimeBudgetUnparseableError,
    TimeBufferMultiplierInvalidError,
    decompose,
)


def test_simple_goal_returns_tasks_with_acceptance_criteria(uuid_factory: Any) -> None:
    """A recognised verb + noun goal returns 3..12 tasks; each has criteria."""

    output = decompose(
        goal="ship the founding-scope RFC by Friday",
        uuid_factory=uuid_factory,
    )

    assert 3 <= len(output.tasks) <= 12
    for task in output.tasks:
        assert len(task.acceptance_criteria) >= 1
        assert 5 <= task.estimated_minutes <= 90
    sequences = [t.sequence for t in output.tasks]
    assert sequences == sorted(sequences)
    assert sequences[0] == 1
    assert len(set(sequences)) == len(sequences)


def test_sequence_is_total_order_across_parallel_branches(uuid_factory: Any) -> None:
    """Multiple recognised verbs produce a strict-total-order sequence list."""

    output = decompose(
        goal="ship and review the migration doc by Friday",
        uuid_factory=uuid_factory,
    )
    sequences = sorted(t.sequence for t in output.tasks)
    assert sequences == list(range(1, len(output.tasks) + 1))


def test_vague_goal_returns_decomposition_unavailable(uuid_factory: Any) -> None:
    """Goals with no recognised verb or noun raise the typed unavailable error."""

    with pytest.raises(DecompositionUnavailableError) as info:
        decompose(goal="do the thing", uuid_factory=uuid_factory)

    assert info.value.clarifying_question
    assert info.value.ambiguity_class in {
        "no_recognised_verb",
        "no_recognised_verb_or_noun",
    }


def test_goal_too_short_raises_goal_required(uuid_factory: Any) -> None:
    """Goal shorter than 5 trimmed chars raises GOAL_REQUIRED."""

    with pytest.raises(GoalRequiredError):
        decompose(goal=" hi ", uuid_factory=uuid_factory)


def test_goal_too_long_raises_goal_too_long(uuid_factory: Any) -> None:
    """Goal longer than 500 chars raises GOAL_TOO_LONG."""

    long_goal = "ship " + ("the rfc " * 200)
    assert len(long_goal) > 500
    with pytest.raises(GoalTooLongError):
        decompose(goal=long_goal, uuid_factory=uuid_factory)


def test_unparseable_time_budget_raises_typed_error(uuid_factory: Any) -> None:
    """Garbage ``time_budget`` raises TIME_BUDGET_UNPARSEABLE."""

    with pytest.raises(TimeBudgetUnparseableError):
        decompose(
            goal="fix the bug today",
            time_budget="not-a-duration",
            uuid_factory=uuid_factory,
        )


def test_budget_infeasible_when_plan_exceeds_budget(uuid_factory: Any) -> None:
    """A tiny budget against a multi-step goal raises BUDGET_INFEASIBLE."""

    with pytest.raises(BudgetInfeasibleError) as info:
        decompose(
            goal="ship and review the migration doc by Friday",
            time_budget="PT10M",
            uuid_factory=uuid_factory,
        )
    assert info.value.minimum_feasible_minutes > 10
    assert info.value.attempted_task_count >= 1


def test_rationale_does_not_contain_goal_text(uuid_factory: Any) -> None:
    """Rationale text NEVER includes the user's original goal verbatim.

    Strong privacy invariant per ADR 0003 §7.
    """

    secret_phrase = "operation acorn-pancake"
    output = decompose(
        goal=f"draft the proposal for {secret_phrase}",
        uuid_factory=uuid_factory,
    )
    assert "acorn-pancake" not in output.rationale
    for task in output.tasks:
        assert "acorn-pancake" not in task.title
        assert "acorn-pancake" not in task.description


# --- R2: neurotype hooks (optional, additive per ADR 0011) ------------------


def test_no_neurotype_inputs_returns_pre_r2_wire_shape(uuid_factory: Any) -> None:
    """Backward-compat: with NONE of the new inputs the wire shape is unchanged.

    No ``padded_minutes`` on any task, no ``time_buffer_multiplier`` /
    ``motor_fatigue_aware`` / ``truncated`` top-level keys. The dumped payload
    must be byte-identical to the pre-R2 contract (only ``tasks`` + ``rationale``).
    """

    output = decompose(
        goal="ship the founding-scope RFC by Friday",
        uuid_factory=uuid_factory,
    )

    # The server boundary dumps with exclude_none=True (the chronometric R5
    # pattern): unset optional additive fields never reach the wire.
    dumped = output.model_dump(exclude_none=True)
    assert set(dumped.keys()) == {"tasks", "rationale"}
    for task in dumped["tasks"]:
        assert "padded_minutes" not in task
        assert set(task.keys()) == {
            "id",
            "title",
            "description",
            "estimated_minutes",
            "acceptance_criteria",
            "dependencies",
            "sequence",
            "tags",
        }


def test_max_chunk_size_caps_returned_task_count(uuid_factory: Any) -> None:
    """``max_chunk_size`` lowers the ceiling on the number of returned tasks."""

    full = decompose(
        goal="ship and review and refactor the migration doc",
        uuid_factory=uuid_factory,
    )
    assert len(full.tasks) > 2

    capped = decompose(
        goal="ship and review and refactor the migration doc",
        max_chunk_size=2,
        uuid_factory=uuid_factory,
    )
    assert len(capped.tasks) == 2


def test_max_chunk_size_keeps_a_valid_prefix_and_no_dangling_deps(
    uuid_factory: Any,
) -> None:
    """Truncation keeps a valid prefix: sequences contiguous, no dangling deps."""

    capped = decompose(
        goal="ship and review and refactor the migration doc",
        max_chunk_size=2,
        uuid_factory=uuid_factory,
    )

    sequences = [t.sequence for t in capped.tasks]
    assert sequences == list(range(1, len(capped.tasks) + 1))

    kept_ids = {t.id for t in capped.tasks}
    for task in capped.tasks:
        for dep in task.dependencies:
            assert dep in kept_ids, "truncated task references a dropped dependency"


def test_max_chunk_size_notes_truncation_in_rationale(uuid_factory: Any) -> None:
    """When the plan is reduced the rationale must say so (no silent drop).

    The note uses existence framing ("still in the plan") rather than obligation
    framing, and the opening count must agree with the delivered count: the
    rationale leads with the natural plan size and names how many are returned.
    """

    capped = decompose(
        goal="ship and review and refactor the migration doc",
        max_chunk_size=2,
        uuid_factory=uuid_factory,
    )
    lowered = capped.rationale.lower()
    # No silent drop: the rationale states the natural plan and what is returned.
    assert "returning the first 2" in lowered
    assert "still in the plan" in lowered
    # Existence framing, not task-debt/obligation framing (rejection-sensitivity).
    assert "still need doing" not in lowered
    # Coherence: the delivered count appears, the contradictory "across 5 tasks"
    # opening does not.
    assert "across 2 tasks" in lowered


def test_max_chunk_size_above_natural_count_is_a_no_op(uuid_factory: Any) -> None:
    """A cap larger than the natural plan does not change anything."""

    natural = decompose(goal="fix the bug today", uuid_factory=uuid_factory)
    capped = decompose(
        goal="fix the bug today",
        max_chunk_size=min(len(natural.tasks) + 50, 20),
        uuid_factory=uuid_factory,
    )
    assert len(capped.tasks) == len(natural.tasks)
    assert "truncat" not in capped.rationale.lower()


def test_max_chunk_size_below_one_raises(uuid_factory: Any) -> None:
    """A non-positive cap is a caller bug; the boundary rejects it."""

    with pytest.raises(MaxChunkSizeInvalidError):
        decompose(
            goal="fix the bug today",
            max_chunk_size=0,
            uuid_factory=uuid_factory,
        )


def test_max_chunk_size_above_twenty_raises(uuid_factory: Any) -> None:
    """The pure decomposer enforces the same 1..20 band as the server.

    The server's ``Field(le=20)`` guards MCP callers, but a direct/library
    caller must not be able to bypass the contract by passing a larger cap.
    """

    with pytest.raises(MaxChunkSizeInvalidError):
        decompose(
            goal="fix the bug today",
            max_chunk_size=21,
            uuid_factory=uuid_factory,
        )


def test_time_buffer_multiplier_below_band_raises(uuid_factory: Any) -> None:
    """A multiplier below 1.0 would *shrink* an estimate and is rejected."""

    with pytest.raises(TimeBufferMultiplierInvalidError):
        decompose(
            goal="fix the bug today",
            time_buffer_multiplier=0.9,
            uuid_factory=uuid_factory,
        )


def test_time_buffer_multiplier_above_band_raises(uuid_factory: Any) -> None:
    """A multiplier above 3.0 is out of the supported band and is rejected."""

    with pytest.raises(TimeBufferMultiplierInvalidError):
        decompose(
            goal="fix the bug today",
            time_buffer_multiplier=3.1,
            uuid_factory=uuid_factory,
        )


def test_time_buffer_multiplier_adds_padded_minutes_without_touching_raw(
    uuid_factory: Any,
) -> None:
    """``time_buffer_multiplier`` > 1.0 adds optional ``padded_minutes`` per task.

    ``estimated_minutes`` MUST stay raw (no double-pad), and ``padded_minutes``
    MUST equal round(estimated_minutes * multiplier).
    """

    output = decompose(
        goal="ship the founding-scope RFC by Friday",
        time_buffer_multiplier=1.5,
        uuid_factory=uuid_factory,
    )

    assert output.time_buffer_multiplier == 1.5
    for task in output.tasks:
        assert task.padded_minutes == round(task.estimated_minutes * 1.5)
        # raw estimate is unchanged and still within the contract band
        assert 5 <= task.estimated_minutes <= 90
    # the multiplier is named in the rationale so the user can correct it
    assert "1.5" in output.rationale


def test_multiplier_of_one_omits_padding_entirely(uuid_factory: Any) -> None:
    """A multiplier of exactly 1.0 is a no-op: no padding, no echo, no rationale."""

    output = decompose(
        goal="ship the founding-scope RFC by Friday",
        time_buffer_multiplier=1.0,
        uuid_factory=uuid_factory,
    )

    dumped = output.model_dump(exclude_none=True)
    assert set(dumped.keys()) == {"tasks", "rationale"}
    for task in output.tasks:
        assert task.padded_minutes is None


def test_motor_fatigue_aware_is_echoed_honestly(uuid_factory: Any) -> None:
    """``motor_fatigue_aware`` is echoed; the server claims no activity data."""

    output = decompose(
        goal="ship the founding-scope RFC by Friday",
        motor_fatigue_aware=True,
        uuid_factory=uuid_factory,
    )

    assert output.motor_fatigue_aware is True
    # honest scope: the server can't see motor activity, so it says so
    assert "motor" in output.rationale.lower()


def test_motor_fatigue_aware_false_is_omitted(uuid_factory: Any) -> None:
    """``motor_fatigue_aware`` defaulting to False keeps the pre-R2 shape."""

    output = decompose(
        goal="ship the founding-scope RFC by Friday",
        motor_fatigue_aware=False,
        uuid_factory=uuid_factory,
    )
    dumped = output.model_dump(exclude_none=True)
    assert set(dumped.keys()) == {"tasks", "rationale"}


def test_padded_minutes_respected_under_truncation(uuid_factory: Any) -> None:
    """The hooks compose: padding + capping at once stays consistent."""

    output = decompose(
        goal="ship and review and refactor the migration doc",
        max_chunk_size=2,
        time_buffer_multiplier=2.0,
        uuid_factory=uuid_factory,
    )
    assert len(output.tasks) == 2
    for task in output.tasks:
        assert task.padded_minutes == round(task.estimated_minutes * 2.0)
