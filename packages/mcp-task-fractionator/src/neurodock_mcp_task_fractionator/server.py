"""FastMCP server registration for the task fractionator tools.

Two tools are registered (`decompose`, `next_one`). The server is pure glue —
the heuristic engine lives in :mod:`decomposer`, the source protocol lives in
:mod:`sources`, and Pydantic models live in :mod:`types`.

Per ADR 0003 §7 nothing in this module logs goal text or project names.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

from fastmcp import FastMCP

from neurodock_mcp_task_fractionator.decomposer import (
    AcceptanceCriteriaRequiredError,
    BudgetInfeasibleError,
    DecompositionUnavailableError,
    GoalRequiredError,
    GoalTooLongError,
    TimeBudgetUnparseableError,
)
from neurodock_mcp_task_fractionator.sources import (
    CognitiveGraphUnavailableError,
    PendingTaskSource,
    load_pending_task_source,
)
from neurodock_mcp_task_fractionator.tools.decompose import decompose
from neurodock_mcp_task_fractionator.tools.next_one import (
    AllTasksBlockedError,
    NoTasksAvailableError,
    ProjectRequiredError,
    ProjectTooLongError,
    next_one,
)
from neurodock_mcp_task_fractionator.topological import DependencyCycleError

SERVER_NAME = "neurodock-mcp-task-fractionator"
SERVER_VERSION = "0.0.1"

_LOG = logging.getLogger("neurodock_mcp_task_fractionator.server")


class _ToolError(RuntimeError):
    """Internal exception type that carries an MCP-friendly error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


def build_server(*, source: PendingTaskSource | None = None) -> FastMCP[Any]:
    """Construct a fully wired FastMCP server with both tools registered.

    ``source`` controls where ``next_one`` reads pending tasks from. Production
    callers pass nothing and the env-var-driven factory selects the default.
    Tests pass a stub source explicitly.
    """

    effective_source: PendingTaskSource = (
        source if source is not None else load_pending_task_source()
    )

    mcp: FastMCP[Any] = FastMCP(name=SERVER_NAME, version=SERVER_VERSION)

    @mcp.tool(
        name="decompose",
        description=(
            "Break a vague goal into a small ordered list of atomic 5-90 minute "
            "tasks with explicit acceptance criteria and dependency edges. "
            "Stateless: returns tasks but does NOT persist them."
        ),
    )
    def _decompose(goal: str, time_budget: str | None = None) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "decompose"})
        try:
            result = decompose(goal=goal, time_budget=time_budget)
        except GoalRequiredError as exc:
            raise _ToolError("GOAL_REQUIRED", str(exc)) from exc
        except GoalTooLongError as exc:
            raise _ToolError("GOAL_TOO_LONG", str(exc)) from exc
        except TimeBudgetUnparseableError as exc:
            raise _ToolError("TIME_BUDGET_UNPARSEABLE", str(exc)) from exc
        except BudgetInfeasibleError as exc:
            _LOG.warning(
                "budget_infeasible",
                extra={
                    "minimum_feasible_minutes": exc.minimum_feasible_minutes,
                    "attempted_task_count": exc.attempted_task_count,
                },
            )
            raise _ToolError(
                "BUDGET_INFEASIBLE",
                (
                    f"minimum feasible minutes: {exc.minimum_feasible_minutes}; "
                    f"attempted task count: {exc.attempted_task_count}"
                ),
            ) from exc
        except DecompositionUnavailableError as exc:
            _LOG.warning(
                "decomposition_unavailable",
                extra={"ambiguity_class": exc.ambiguity_class},
            )
            raise _ToolError(
                "DECOMPOSITION_UNAVAILABLE",
                f"clarifying_question: {exc.clarifying_question}",
            ) from exc
        except DependencyCycleError as exc:
            _LOG.error("dependency_cycle")
            raise _ToolError("DEPENDENCY_CYCLE", str(exc)) from exc
        except AcceptanceCriteriaRequiredError as exc:
            _LOG.error("acceptance_criteria_required")
            raise _ToolError("ACCEPTANCE_CRITERIA_REQUIRED", str(exc)) from exc
        return result.model_dump(exclude_none=False)

    @mcp.tool(
        name="next_one",
        description=(
            "Return exactly one task for the given project — the single thing "
            "the user should do next — with reasoning and a confidence number. "
            "Errors with NO_TASKS_AVAILABLE when nothing is pending."
        ),
    )
    def _next_one(project: str) -> dict[str, Any]:
        _LOG.info("tool_invoked", extra={"tool": "next_one"})
        try:
            result = next_one(project=project, source=effective_source)
        except ProjectRequiredError as exc:
            raise _ToolError("PROJECT_REQUIRED", str(exc)) from exc
        except ProjectTooLongError as exc:
            raise _ToolError("PROJECT_REQUIRED", str(exc)) from exc
        except NoTasksAvailableError as exc:
            raise _ToolError("NO_TASKS_AVAILABLE", str(exc)) from exc
        except AllTasksBlockedError as exc:
            raise _ToolError(
                "ALL_TASKS_BLOCKED",
                (f"blocked_task_id: {exc.blocked_task_id}; blocker_ids: {exc.blocker_ids}"),
            ) from exc
        except CognitiveGraphUnavailableError as exc:
            raise _ToolError("COGNITIVE_GRAPH_UNAVAILABLE", str(exc)) from exc
        return result.model_dump(exclude_none=False)

    return mcp


# Module-level "default" server, useful for ``python -m`` invocation and for
# smoke tests that just want to confirm registration succeeds.
app: FastMCP[Any] = build_server()


def main() -> None:
    """Console-script entrypoint: run the server over stdio."""

    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format='{"logger":"%(name)s","level":"%(levelname)s","msg":"%(message)s"}',
    )
    app.run()


if __name__ == "__main__":  # pragma: no cover - exercised via console script
    main()
