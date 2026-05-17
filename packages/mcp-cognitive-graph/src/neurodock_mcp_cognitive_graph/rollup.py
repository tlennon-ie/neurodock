"""Heuristics for ``weekly_rollup``.

Per ADR 0002 open question 3 we resolve to **option 1**: keep the heuristic
and label it as heuristic. ``next_actions`` are templated from:

1. Open blockers — ``blocked_by`` facts with no later ``resolved_by`` fact for
   the same subject in the window.
2. Recent decisions lacking follow-up — ``decided_in`` facts on decisions with
   no ``resolved_by`` fact referencing them.
3. Facts ``tagged`` with the literal ``"next-action"``.

The list is capped at 10. The format follows the schema's examples ("Resolve
blocker on <subject>: '<literal>'", "Follow up on decision '<name>' …").
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from datetime import date as _date

from neurodock_mcp_cognitive_graph.storage.base import EntityRow, FactRow, Storage
from neurodock_mcp_cognitive_graph.tools._shared import fact_row_to_fact
from neurodock_mcp_cognitive_graph.types import (
    DecisionAttributor,
    Fact,
    LiteralValue,
    Period,
    RollupDecision,
)


@dataclass
class _DecisionSlot:
    """Mutable accumulator used while assembling rollup decisions."""

    row: EntityRow
    recorded_at: datetime
    attributors: list[DecisionAttributor] = field(default_factory=list)
    source: str | None = None
    confidence: float = 1.0


NEXT_ACTIONS_CAP = 10
DECISIONS_CAP = 50
BLOCKERS_CAP = 50


def compute_period(today: _date) -> Period:
    """Return a 7-day inclusive window ending at ``today``."""
    from datetime import timedelta

    start = today - timedelta(days=6)
    return Period(start=start, end=today)


def _date_of(dt: datetime) -> _date:
    return dt.astimezone(UTC).date()


def _within_period(dt: datetime, period: Period) -> bool:
    d = _date_of(dt)
    return period.start <= d <= period.end


def collect_decisions_in_window(
    storage: Storage,
    period: Period,
    project_id: str | None,
) -> list[RollupDecision]:
    """Return decisions whose ``decided_in`` fact landed inside ``period``.

    If ``project_id`` is None, decisions for any project are returned.
    """
    decided_in_facts = [
        f for f in storage.facts_by_predicate("decided_in") if _within_period(f.recorded_at, period)
    ]
    if project_id is not None:
        decided_in_facts = [
            f for f in decided_in_facts if f.subject_id == project_id or f.object_id == project_id
        ]

    # Map decision_id -> slot.
    accum: dict[str, _DecisionSlot] = {}
    for fact in decided_in_facts:
        # Determine which side is the decision (type=decision); attributor is the other.
        subj_row = storage.find_entity_by_id(fact.subject_id)
        obj_row = storage.find_entity_by_id(fact.object_id) if fact.object_id is not None else None
        decision_row: EntityRow | None = None
        attributor_row: EntityRow | None = None
        if obj_row is not None and obj_row.type == "decision":
            decision_row = obj_row
            attributor_row = subj_row
        elif subj_row is not None and subj_row.type == "decision":
            decision_row = subj_row
            attributor_row = obj_row
        if decision_row is None:
            continue
        slot = accum.setdefault(
            decision_row.id,
            _DecisionSlot(row=decision_row, recorded_at=fact.recorded_at),
        )
        if fact.recorded_at > slot.recorded_at:
            slot.recorded_at = fact.recorded_at
        if attributor_row is not None and attributor_row.type != "project":
            attr = DecisionAttributor(
                type=attributor_row.type, id=attributor_row.id, name=attributor_row.name
            )
            if attr not in slot.attributors:
                slot.attributors.append(attr)
        if fact.source and slot.source is None:
            slot.source = fact.source
        slot.confidence = fact.confidence

    out: list[RollupDecision] = []
    for slot in accum.values():
        out.append(
            RollupDecision(
                id=slot.row.id,
                name=slot.row.name,
                decided_on=_date_of(slot.recorded_at),
                decided_by=slot.attributors,
                source=slot.source,
                confidence=slot.confidence,
            )
        )
    out.sort(key=lambda d: d.decided_on, reverse=True)
    return out[:DECISIONS_CAP]


def collect_open_blockers(
    storage: Storage,
    project_id: str | None,
) -> list[Fact]:
    """Return open blockers (``blocked_by`` with no later ``resolved_by``)."""
    blocker_rows = storage.facts_by_predicate("blocked_by")
    resolved_rows = storage.facts_by_predicate("resolved_by")
    resolved_subjects = {
        (r.subject_id, r.recorded_at) for r in resolved_rows if r.subject_id is not None
    }

    def _is_open(b: FactRow) -> bool:
        for sid, resolved_at in resolved_subjects:
            if sid == b.subject_id and resolved_at >= b.recorded_at:
                return False
        return True

    open_blockers = [b for b in blocker_rows if _is_open(b)]
    if project_id is not None:
        open_blockers = [
            b for b in open_blockers if b.subject_id == project_id or b.object_id == project_id
        ]
    open_blockers.sort(key=lambda b: b.recorded_at, reverse=True)
    open_blockers = open_blockers[:BLOCKERS_CAP]
    return [fact_row_to_fact(b, storage) for b in open_blockers]


def synthesise_next_actions(
    decisions: list[RollupDecision],
    blockers: list[Fact],
    tagged_next_actions: list[Fact],
) -> list[str]:
    """Render the next-actions list per ADR 0002 option 1.

    Heuristic, not authoritative. Skill consumers should label appropriately.
    """
    actions: list[str] = []

    for blk in blockers:
        subj_name = blk.subject.name
        if isinstance(blk.object, LiteralValue):
            actions.append(f"Resolve blocker on {subj_name}: '{blk.object.literal}'")
        else:
            actions.append(f"Resolve blocker on {subj_name}: '{blk.object.name}'")
        if len(actions) >= NEXT_ACTIONS_CAP:
            return actions

    for dec in decisions:
        actions.append(f"Follow up on decision '{dec.name}' with implementation owner")
        if len(actions) >= NEXT_ACTIONS_CAP:
            return actions

    for fact in tagged_next_actions:
        if isinstance(fact.object, LiteralValue) and fact.object.literal == "next-action":
            actions.append(f"Address tagged next-action on {fact.subject.name}")
            if len(actions) >= NEXT_ACTIONS_CAP:
                return actions

    return actions


def render_summary(
    project_name: str | None,
    decisions: list[RollupDecision],
    blockers: list[Fact],
    next_actions: list[str],
) -> str:
    """Render the plain-text summary (vendor-boundary-clean, no LLM)."""
    scope = f"on {project_name}" if project_name else "across all projects"
    base = (
        f"This week {scope}: {len(decisions)} decisions recorded, "
        f"{len(blockers)} blockers noted, {len(next_actions)} candidate next actions."
    )
    if decisions:
        latest = decisions[0]
        attributors = ", ".join(a.name for a in latest.decided_by)
        attributor_str = f" ({attributors}, {latest.decided_on.isoformat()})"
        base += f" Most recent decision: {latest.name}{attributor_str}."
    return base
