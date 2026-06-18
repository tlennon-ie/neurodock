# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Local heuristic decomposition engine for v0.0.1.

Per ADR 0003 §2 there is **no LLM call inside this server**. v0.0.1 uses a
small templating + keyword-recognition engine. It recognises a fixed set of
verbs, nouns, and time markers (ADR open question 1) and synthesises a short
task skeleton with at least one acceptance criterion per task (ADR §4).

For genuinely vague input ("do the thing") it returns
:class:`DecompositionUnavailableError` carrying a canned per-ambiguity-class
clarifying question rather than fabricating a poor decomposition.

The decomposer is intentionally deterministic apart from UUIDv4 generation:
the same goal produces the same task shape and count within a single run.
UUIDs are taken from an injectable factory so tests can freeze them.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

from neurodock_mcp_task_fractionator.duration import (
    ParsedTimeBudget,
    TimeBudgetUnparseableError,
    parse_time_budget,
)
from neurodock_mcp_task_fractionator.topological import (
    DependencyCycleError,
    _Node,
    topological_sort,
)
from neurodock_mcp_task_fractionator.types import DecomposeOutput, Task

# Public exceptions ----------------------------------------------------------


class GoalRequiredError(ValueError):
    """Raised when the goal is missing or shorter than 5 chars after trimming."""


class GoalTooLongError(ValueError):
    """Raised when the goal exceeds 500 characters."""


class MaxChunkSizeInvalidError(ValueError):
    """Raised when ``max_chunk_size`` is supplied but is out of range.

    R2 neurotype hook (ADR 0011): the cap is an optional knob in 1..20. A
    non-integer, non-positive, or above-20 value is a caller bug — surfaced,
    never silently ignored. The pure decomposer enforces the same 1..20 band as
    the server's ``Field(ge=1, le=20)`` so direct/library callers cannot bypass
    the contract.
    """


class TimeBufferMultiplierInvalidError(ValueError):
    """Raised when ``time_buffer_multiplier`` is outside the supported band.

    R2 neurotype hook (ADR 0011): the buffer is an optional knob in roughly
    [1.0, 3.0]. Values below 1.0 (which would *shrink* an estimate) or above
    3.0 are rejected rather than silently clamped.
    """


class BudgetInfeasibleError(RuntimeError):
    """Raised when no task list can fit inside ``time_budget``.

    Carries a structured payload (per ADR open question 3, strict variant).
    """

    def __init__(
        self,
        *,
        minimum_feasible_minutes: int,
        attempted_task_count: int,
    ) -> None:
        super().__init__(
            f"minimum feasible {minimum_feasible_minutes} min for "
            f"{attempted_task_count} tasks exceeds budget"
        )
        self.minimum_feasible_minutes = minimum_feasible_minutes
        self.attempted_task_count = attempted_task_count


class DecompositionUnavailableError(RuntimeError):
    """Raised when the heuristic engine cannot carve the goal.

    Carries a canned clarifying question for the caller to surface (ADR open
    question 1). The question is per-ambiguity-class, not free-form.
    """

    def __init__(self, *, clarifying_question: str, ambiguity_class: str) -> None:
        super().__init__(f"decomposition unavailable ({ambiguity_class})")
        self.clarifying_question = clarifying_question
        self.ambiguity_class = ambiguity_class


class AcceptanceCriteriaRequiredError(RuntimeError):
    """Raised when an internal candidate task has zero acceptance criteria.

    Per ADR §4 this is a server-side correctness invariant: callers cannot
    trigger it directly.
    """


# Internal types -------------------------------------------------------------


UuidFactory = Callable[[], str]


def _default_uuid_factory() -> str:
    return str(uuid.uuid4())


# Verb / noun / time-marker vocabularies. Per ADR open question 1.

_VERBS: dict[str, str] = {
    "ship": "ship",
    "shipping": "ship",
    "fix": "fix",
    "fixing": "fix",
    "draft": "draft",
    "drafting": "draft",
    "set up": "set up",
    "setup": "set up",
    "write": "write",
    "writing": "write",
    "review": "review",
    "reviewing": "review",
    "decide": "decide",
    "deciding": "decide",
    "migrate": "migrate",
    "migrating": "migrate",
    "refactor": "refactor",
    "refactoring": "refactor",
    "investigate": "investigate",
    "investigating": "investigate",
    "respond to": "respond to",
    "respond": "respond to",
    "reply to": "respond to",
}

_NOUNS: set[str] = {
    "rfc",
    "bug",
    "feature",
    "pr",
    "issue",
    "meeting",
    "doc",
    "docs",
    "migration",
    "email",
    "proposal",
    "review",
    "test",
    "tests",
}

_TIME_MARKER_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\bby (?:next )?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b"),
    re.compile(r"\bbefore the demo\b"),
    re.compile(r"\bbefore (?:the )?launch\b"),
    re.compile(r"\btoday\b"),
    re.compile(r"\btomorrow\b"),
    re.compile(r"\bthis week\b"),
    re.compile(r"\bnext week\b"),
    re.compile(r"\bend of (?:the )?(?:day|week|month|quarter)\b"),
)


@dataclass(frozen=True)
class _Skeleton:
    """Pre-sequence task skeleton; sequence and dependencies set after sort."""

    task_id: str
    title: str
    description: str
    estimated_minutes: int
    acceptance_criteria: tuple[str, ...]
    dependencies: tuple[str, ...]
    tags: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class _DecomposePlan:
    """A candidate, pre-sort decomposition. Used to test budget feasibility.

    The rationale is held as two parts so the formatter can swap *only* the
    opening count sentence under truncation while leaving the budget/time-marker
    tail untouched. ``rationale_opening`` is the "Carved the goal into N task(s)"
    sentence; ``rationale_extra`` is the optional budget/time-marker sentences
    that follow it. Concatenated with a single space they reproduce the
    pre-R2 seed byte-for-byte.
    """

    skeletons: tuple[_Skeleton, ...]
    rationale_opening: str
    rationale_extra: str

    @property
    def total_minutes(self) -> int:
        return sum(s.estimated_minutes for s in self.skeletons)


# Acceptance-criterion templates per verb. Each verb must yield at least one
# observable, outside-the-head done condition (ADR §4).
_VERB_ACCEPTANCE: dict[str, tuple[str, ...]] = {
    "ship": (
        "PR merged to main",
        "Release notes updated for the change",
    ),
    "fix": (
        "All repro steps no longer reproduce the bug",
        "Regression test added and passing",
    ),
    "draft": (
        "First draft committed to the repo",
        "Draft shared with at least one reviewer",
    ),
    "set up": (
        "New scaffold exists and runs locally with one command",
        "CI passes on the new scaffold",
    ),
    "write": (
        "Document or code change committed to the repo",
        "At least one reviewer requested",
    ),
    "review": (
        "Review comments left on the artefact",
        "Reviewer marks the artefact approved or requests changes",
    ),
    "decide": (
        "Decision recorded with date and rationale",
        "Decision communicated to affected parties",
    ),
    "migrate": (
        "New target state in place and verified",
        "Old state decommissioned or scheduled for removal",
    ),
    "refactor": (
        "Behaviour-preserving change merged",
        "Tests pass before and after refactor",
    ),
    "investigate": (
        "Findings written up in a short note",
        "Concrete next-step decision proposed",
    ),
    "respond to": (
        "Response sent to the original requester",
        "Any required follow-up tasks captured",
    ),
}


# Public API -----------------------------------------------------------------


def decompose(
    *,
    goal: str,
    time_budget: str | None = None,
    max_chunk_size: int | None = None,
    time_buffer_multiplier: float | None = None,
    motor_fatigue_aware: bool | None = None,
    uuid_factory: UuidFactory | None = None,
) -> DecomposeOutput:
    """Local-heuristic decomposition of ``goal``.

    Pure function: no I/O, no logging of the goal text.

    The three optional R2 neurotype hooks (ADR 0011) all default to today's
    behaviour when absent, so a call with none of them is byte-identical to the
    pre-R2 contract:

    - ``max_chunk_size`` — lower the ceiling on the number of returned tasks.
      The existing 3..12 target / hard-cap-20 logic still applies above this.
      When the natural plan is longer than the cap we keep the lowest-sequence
      prefix (a valid sub-DAG by construction — the chain only points
      backward), drop any now-dangling dependency references, and record the
      truncation in the rationale rather than silently dropping steps.
    - ``time_buffer_multiplier`` — when > 1.0, attach an additive
      ``padded_minutes`` (= round(estimated_minutes * multiplier)) to each
      task; ``estimated_minutes`` stays RAW so a presentation layer never
      double-pads. Echoed in the output and named in the rationale. A value of
      exactly 1.0 is a no-op.
    - ``motor_fatigue_aware`` — a declared preference the server echoes. The
      server has no keystroke/click stream, so it surfaces the flag and says so
      in the rationale rather than fabricating activity data.
    """

    if not isinstance(goal, str):
        raise GoalRequiredError("goal must be a string")
    trimmed = goal.strip()
    if len(trimmed) < 5:
        raise GoalRequiredError("goal must be at least 5 non-whitespace characters")
    if len(trimmed) > 500:
        raise GoalTooLongError("goal exceeds 500 characters")

    if max_chunk_size is not None:
        if not isinstance(max_chunk_size, int) or isinstance(max_chunk_size, bool):
            raise MaxChunkSizeInvalidError("max_chunk_size must be an integer")
        if max_chunk_size < 1:
            raise MaxChunkSizeInvalidError("max_chunk_size must be a positive integer")
        if max_chunk_size > 20:
            raise MaxChunkSizeInvalidError("max_chunk_size must be 20 or fewer")

    if time_buffer_multiplier is not None:
        if not isinstance(time_buffer_multiplier, int | float) or isinstance(
            time_buffer_multiplier, bool
        ):
            raise TimeBufferMultiplierInvalidError("time_buffer_multiplier must be a number")
        if time_buffer_multiplier < 1.0 or time_buffer_multiplier > 3.0:
            raise TimeBufferMultiplierInvalidError(
                "time_buffer_multiplier must be between 1.0 and 3.0"
            )

    parsed_budget: ParsedTimeBudget | None = None
    if time_budget is not None:
        # Caller-controlled invariant: never re-raise a different type from
        # this helper without translation at the server boundary.
        parsed_budget = parse_time_budget(time_budget)

    factory = uuid_factory if uuid_factory is not None else _default_uuid_factory

    lowered = trimmed.lower()
    detected_verbs = _detect_verbs(lowered)
    detected_nouns = _detect_nouns(lowered)
    detected_time_markers = _detect_time_markers(lowered)

    if not detected_verbs and not detected_nouns:
        raise DecompositionUnavailableError(
            clarifying_question=(
                "I could not identify a concrete action or artefact in this goal. "
                "What is the specific thing you want to ship, fix, draft, or decide?"
            ),
            ambiguity_class="no_recognised_verb_or_noun",
        )
    if not detected_verbs:
        raise DecompositionUnavailableError(
            clarifying_question=(
                "I see an artefact but no clear action verb. "
                "Do you want to ship it, fix it, draft it, review it, or decide on it?"
            ),
            ambiguity_class="no_recognised_verb",
        )

    plan = _build_plan(
        verbs=detected_verbs,
        nouns=detected_nouns,
        time_markers=detected_time_markers,
        budget=parsed_budget,
        factory=factory,
        goal_summary_hint=_summarise_goal_for_rationale(detected_verbs, detected_nouns),
    )

    # Enforce the v0.0.1 invariant: every task carries at least one criterion.
    for skeleton in plan.skeletons:
        if len(skeleton.acceptance_criteria) == 0:
            raise AcceptanceCriteriaRequiredError("internal task missing acceptance criteria")

    if parsed_budget is not None and plan.total_minutes > parsed_budget.minutes_ceiling:
        raise BudgetInfeasibleError(
            minimum_feasible_minutes=plan.total_minutes,
            attempted_task_count=len(plan.skeletons),
        )

    # Topologically sort and assign total-order sequence numbers.
    nodes = [_Node(s.task_id, s.estimated_minutes, s.dependencies) for s in plan.skeletons]
    try:
        ordered_ids = topological_sort(nodes)
    except DependencyCycleError:
        # Re-raise — server boundary translates to DEPENDENCY_CYCLE.
        raise

    # R2: apply the max_chunk_size cap. We keep the lowest-sequence prefix of
    # the total order. Because every dependency in this engine points strictly
    # backward along the chain, the prefix is a valid sub-DAG; we still filter
    # dangling dependency references defensively so a future non-linear plan
    # can never produce an invalid topo order.
    natural_count = len(ordered_ids)
    truncated = max_chunk_size is not None and max_chunk_size < natural_count
    if max_chunk_size is not None:
        kept_ids = ordered_ids[:max_chunk_size]
    else:
        kept_ids = ordered_ids
    kept_id_set = set(kept_ids)

    by_id = {s.task_id: s for s in plan.skeletons}
    tasks: list[Task] = []
    for index, task_id in enumerate(kept_ids, start=1):
        skeleton = by_id[task_id]
        kept_dependencies = [dep for dep in skeleton.dependencies if dep in kept_id_set]
        padded_minutes = _padded_minutes(skeleton.estimated_minutes, time_buffer_multiplier)
        tasks.append(
            Task(
                id=skeleton.task_id,
                title=skeleton.title,
                description=skeleton.description,
                estimated_minutes=skeleton.estimated_minutes,
                padded_minutes=padded_minutes,
                acceptance_criteria=list(skeleton.acceptance_criteria),
                dependencies=kept_dependencies,
                sequence=index,
                tags=list(skeleton.tags),
            )
        )

    rationale = _format_rationale(
        tasks=tasks,
        plan=plan,
        budget=parsed_budget,
        time_markers=detected_time_markers,
        truncated=truncated,
        natural_count=natural_count,
        time_buffer_multiplier=time_buffer_multiplier,
        motor_fatigue_aware=motor_fatigue_aware,
    )

    # Only echo a hook when it is actively in effect, so an unused hook leaves
    # the wire shape byte-identical to pre-R2 (server dumps exclude_none=True).
    echoed_multiplier = (
        time_buffer_multiplier
        if time_buffer_multiplier is not None and time_buffer_multiplier > 1.0
        else None
    )
    # `False` is intentionally equivalent to absent here: there is no distinct
    # "explicit denial" wire state. Both an unset flag and `motor_fatigue_aware=False`
    # collapse to None and are dropped by exclude_none=True, keeping the wire
    # byte-identical to pre-R2. This is a documented design choice, not an oversight.
    echoed_motor = True if motor_fatigue_aware else None
    return DecomposeOutput(
        tasks=tasks,
        rationale=rationale,
        time_buffer_multiplier=echoed_multiplier,
        motor_fatigue_aware=echoed_motor,
        truncated=True if truncated else None,
    )


def _padded_minutes(estimated_minutes: int, multiplier: float | None) -> int | None:
    """Return round(estimated * multiplier) when padding is active, else None.

    A multiplier of exactly 1.0 (or absent) is a no-op: returns ``None`` so the
    additive field is dropped from the wire. ``estimated_minutes`` is never
    mutated — the caller stores this alongside the raw value.
    """

    if multiplier is None or multiplier <= 1.0:
        return None
    return round(estimated_minutes * multiplier)


# Internal helpers -----------------------------------------------------------


def _detect_verbs(lowered_goal: str) -> list[str]:
    found: list[str] = []
    seen: set[str] = set()
    # Multi-word verbs first so "respond to" wins over "respond".
    for surface in sorted(_VERBS, key=lambda k: -len(k)):
        if surface in lowered_goal:
            canonical = _VERBS[surface]
            if canonical not in seen:
                found.append(canonical)
                seen.add(canonical)
    return found


def _detect_nouns(lowered_goal: str) -> list[str]:
    tokens = re.findall(r"[a-z][a-z0-9_-]*", lowered_goal)
    found: list[str] = []
    seen: set[str] = set()
    for token in tokens:
        if token in _NOUNS and token not in seen:
            found.append(token)
            seen.add(token)
    return found


def _detect_time_markers(lowered_goal: str) -> list[str]:
    found: list[str] = []
    for pattern in _TIME_MARKER_PATTERNS:
        match = pattern.search(lowered_goal)
        if match is not None:
            found.append(match.group(0))
    return found


def _summarise_goal_for_rationale(verbs: list[str], nouns: list[str]) -> str:
    """Build a short, content-free phrase used in rationale text.

    NEVER include user goal text verbatim — only the recognised vocabulary
    tokens, which are server-controlled and safe to surface.
    """

    if verbs and nouns:
        return f"{verbs[0]} the {nouns[0]}"
    if verbs:
        return verbs[0]
    return nouns[0] if nouns else "the goal"


def _build_plan(
    *,
    verbs: list[str],
    nouns: list[str],
    time_markers: list[str],
    budget: ParsedTimeBudget | None,
    factory: UuidFactory,
    goal_summary_hint: str,
) -> _DecomposePlan:
    """Compose a small, dependency-tagged plan from the recognised tokens.

    The shape: one task per (verb, noun) pair we recognise, in a TDD-ish chain
    where each task depends on the previous one. This is intentionally crude
    — it is the v0.0.1 contract, not the v0.2 quality bar.
    """

    primary_noun = nouns[0] if nouns else "artefact"

    skeletons: list[_Skeleton] = []

    # Step 1: clarify scope. Always present so vague-but-recognised goals get
    # an explicit definition step.
    scope_id = factory()
    scope_minutes = 15
    skeletons.append(
        _Skeleton(
            task_id=scope_id,
            title=f"Clarify scope of the {primary_noun}",
            description=(
                f"Write one paragraph describing what 'done' means for this "
                f"{primary_noun}. Name the affected files, repos, or people."
            ),
            estimated_minutes=scope_minutes,
            acceptance_criteria=(
                "Scope paragraph exists in a note or issue body",
                "Acceptance criteria for the parent goal are explicit",
            ),
            dependencies=(),
            tags=("scoping",),
        )
    )

    # Step 2..N: one skeleton per recognised verb, dependent on the previous.
    prior_id = scope_id
    verb_minutes_table: dict[str, int] = {
        "ship": 45,
        "fix": 30,
        "draft": 40,
        "set up": 60,
        "write": 35,
        "review": 30,
        "decide": 20,
        "migrate": 60,
        "refactor": 40,
        "investigate": 30,
        "respond to": 20,
    }
    for index, verb in enumerate(verbs):
        new_id = factory()
        minutes = verb_minutes_table.get(verb, 30)
        criteria = _VERB_ACCEPTANCE[verb]
        title = f"{verb.title()} the {primary_noun}"
        description = (
            f"{verb.capitalize()} the {primary_noun}. Tie this step to the scope "
            f"agreed in the previous task. Avoid open-loop exploration."
        )
        tags_list: list[str] = [verb.replace(" ", "_")]
        if "test" in nouns or "tests" in nouns:
            tags_list.append("testing")
        if any("by " in marker or "before " in marker for marker in time_markers):
            tags_list.append("time-bound")
        skeletons.append(
            _Skeleton(
                task_id=new_id,
                title=title[:120],
                description=description[:1000],
                estimated_minutes=minutes,
                acceptance_criteria=criteria,
                dependencies=(prior_id,),
                tags=tuple(dict.fromkeys(tags_list)),
            )
        )
        prior_id = new_id
        # We cap at scope + 6 verb tasks (matches the 3..12 target band).
        if index >= 5:
            break

    # Closing capture step: explicit done-confirmation. Emitted whenever the
    # plan has at least one verb task — every actionable plan ends with an
    # explicit done-check so the 3..12 task band starts at the lowest
    # recognised input.
    if len(skeletons) >= 2:
        capture_id = factory()
        skeletons.append(
            _Skeleton(
                task_id=capture_id,
                title=f"Confirm the {primary_noun} is done",
                description=(
                    "Re-read the scope paragraph and tick each acceptance "
                    "criterion. If anything is unticked, open a follow-up."
                ),
                estimated_minutes=10,
                acceptance_criteria=(
                    "Every acceptance criterion is verified",
                    "Any leftover work is captured as a separate task",
                ),
                dependencies=(prior_id,),
                tags=("closeout",),
            )
        )

    rationale_opening = (
        f"Carved the goal into {len(skeletons)} task(s) around '{goal_summary_hint}'."
    )
    extra_pieces: list[str] = []
    if budget is not None:
        extra_pieces.append(
            f"Budget ceiling {budget.minutes_ceiling} min; "
            f"plan totals {sum(s.estimated_minutes for s in skeletons)} min."
        )
    if time_markers:
        extra_pieces.append("Detected a time marker; the plan is sequenced linearly.")
    rationale_extra = " ".join(extra_pieces)

    return _DecomposePlan(
        skeletons=tuple(skeletons),
        rationale_opening=rationale_opening,
        rationale_extra=rationale_extra,
    )


def _format_rationale(
    *,
    tasks: list[Task],
    plan: _DecomposePlan,
    budget: ParsedTimeBudget | None,
    time_markers: list[str],
    truncated: bool = False,
    natural_count: int | None = None,
    time_buffer_multiplier: float | None = None,
    motor_fatigue_aware: bool | None = None,
) -> str:
    """Build the one-paragraph rationale. NEVER includes goal text.

    The non-truncated rationale is byte-identical to the pre-R2 contract: the
    opening sentence is the natural "Carved the goal into N task(s)…" seed and
    the count agrees with the delivered task list (no truncation, so they are
    the same number). Under truncation the *opening* is rebuilt so the delivered
    count and the opening never contradict each other, and the closing note uses
    existence framing ("still in the plan") rather than obligation framing
    ("still need doing") — this string is effectively user-facing and must meet
    the no-shame bar on its own.
    """

    total = sum(t.estimated_minutes for t in tasks)

    if truncated and natural_count is not None:
        # Lead with the relationship between the natural plan and what we are
        # returning, so the opening count and the delivered count agree.
        opening = (
            f"Planned {natural_count} tasks; returning the first {len(tasks)} "
            f"at your max_chunk_size."
        )
    else:
        opening = plan.rationale_opening
    # Reconstruct the pre-R2 seed: opening + optional budget/time-marker tail.
    seed = f"{opening} {plan.rationale_extra}".rstrip() if plan.rationale_extra else opening

    pieces = [seed]
    pieces.append(f"Estimated total: {total} minutes across {len(tasks)} tasks.")
    if budget is not None:
        headroom = budget.minutes_ceiling - total
        if headroom >= 0:
            pieces.append(f"Headroom inside the budget: {headroom} minutes.")
    pieces.append(
        "Sequence is a total order; tasks at the same topological depth are "
        "tie-broken by estimated_minutes then id."
    )
    # R2 hook rationale lines. Each appears only when its hook is in effect, so
    # the default rationale is unchanged from pre-R2.
    if truncated and natural_count is not None:
        dropped = natural_count - len(tasks)
        pieces.append(
            f"The other {dropped} are still in the plan — re-run without "
            f"the cap (or raise it) to see them."
        )
    if time_buffer_multiplier is not None and time_buffer_multiplier > 1.0:
        pieces.append(
            f"padded_minutes is each raw estimate multiplied by your "
            f"time_buffer_multiplier of {time_buffer_multiplier:g}; estimated_minutes "
            f"stays raw so nothing is padded twice."
        )
    if motor_fatigue_aware:
        pieces.append(
            "motor_fatigue_aware is on: this server has no view of your actual "
            "motor activity, so it only flags the preference for the client to act on "
            "and does not infer fatigue."
        )
    rationale = " ".join(pieces)
    # Defensive cap at the schema's 1000-character limit.
    if len(rationale) > 1000:
        rationale = rationale[:997].rstrip() + "..."
    return rationale


# Re-exported error types so the server module can catch them with one import.
__all__ = [
    "AcceptanceCriteriaRequiredError",
    "BudgetInfeasibleError",
    "DecompositionUnavailableError",
    "GoalRequiredError",
    "GoalTooLongError",
    "MaxChunkSizeInvalidError",
    "TimeBudgetUnparseableError",
    "TimeBufferMultiplierInvalidError",
    "decompose",
]
