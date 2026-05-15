"""Unit tests for ``decompose``."""

from __future__ import annotations

from typing import Any

import pytest
from neurodock_mcp_task_fractionator.decomposer import (
    BudgetInfeasibleError,
    DecompositionUnavailableError,
    GoalRequiredError,
    GoalTooLongError,
    TimeBudgetUnparseableError,
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
