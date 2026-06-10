# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""FastMCP server registration for the task fractionator tools.

Two tools exist (`decompose`, `next_one`). The server is pure glue — the
heuristic engine lives in :mod:`decomposer`, the source protocol lives in
:mod:`sources`, and Pydantic models live in :mod:`types`.

Transport (ADR 0009 sections 1-2): stdio is the default and exposes BOTH
tools. HTTP is opt-in (env ``NEURODOCK_HTTP`` truthy or ``--http``) and exposes
ONLY ``decompose`` — ``next_one`` reads the local cognitive graph and is
therefore not remote-safe, so it is registered in stdio mode only.

Per ADR 0003 §7 nothing in this module logs goal text or project names.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Annotated, Any

from fastmcp import FastMCP
from mcp.types import ToolAnnotations
from pydantic import Field

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
from neurodock_mcp_task_fractionator.transport import (
    TransportConfig,
    select_transport,
)

SERVER_NAME = "neurodock-mcp-task-fractionator"
SERVER_VERSION = "0.0.1"

_LOG = logging.getLogger("neurodock_mcp_task_fractionator.server")


class _ToolError(RuntimeError):
    """Internal exception type that carries an MCP-friendly error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


def build_server(
    *,
    source: PendingTaskSource | None = None,
    http_mode: bool = False,
) -> FastMCP[Any]:
    """Construct a wired FastMCP server.

    ``source`` controls where ``next_one`` reads pending tasks from. Production
    callers pass nothing and the env-var-driven factory selects the default.
    Tests pass a stub source explicitly.

    ``http_mode`` enforces the ADR 0008/0009 remote boundary: when ``True`` the
    server registers ONLY ``decompose`` (the stateless, remote-safe tool) and
    omits ``next_one`` entirely, because ``next_one`` reads the local cognitive
    graph and must never be reachable over a network transport. When ``False``
    (the stdio default) BOTH tools are registered, unchanged from today.
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
        annotations=ToolAnnotations(
            title="Decompose goal into tasks",
            readOnlyHint=True,
            idempotentHint=True,
            openWorldHint=False,
        ),
    )
    def _decompose(
        goal: str,
        time_budget: Annotated[
            str | None,
            Field(
                description=(
                    "Optional total time budget as an ISO-8601 duration, e.g. "
                    "'PT2H' (2 hours) or 'PT90M' (90 minutes) — not prose like "
                    "'a couple of hours'."
                ),
            ),
        ] = None,
    ) -> dict[str, Any]:
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

    # ``next_one`` reads the LOCAL cognitive graph and is NOT remote-safe
    # (ADR 0008/0009). It is registered in stdio mode only; in HTTP mode it is
    # absent from the tool list entirely.
    if not http_mode:

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
                raise _ToolError("PROJECT_TOO_LONG", str(exc)) from exc
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
# smoke tests that just want to confirm registration succeeds. This is the
# stdio build (BOTH tools), matching the default transport.
app: FastMCP[Any] = build_server()


def main() -> None:
    """Console-script entrypoint.

    Default transport is stdio (BOTH tools). HTTP is opt-in via the
    ``NEURODOCK_HTTP`` env var or the ``--http`` flag, and serves ONLY
    ``decompose`` (ADR 0009 sections 1-2).
    """

    logging.basicConfig(
        stream=sys.stderr,
        level=logging.INFO,
        format='{"logger":"%(name)s","level":"%(levelname)s","msg":"%(message)s"}',
    )

    config: TransportConfig = select_transport(os.environ, sys.argv[1:])

    if config.transport == "http":
        # Build a dedicated HTTP server that registers ONLY ``decompose``.
        # ``next_one`` is omitted so it cannot be reached over the network.
        http_app: FastMCP[Any] = build_server(http_mode=True)
        _LOG.info(
            "transport_selected",
            extra={"transport": "http", "host": config.host, "port": config.port},
        )
        http_app.run(transport="http", host=config.host, port=config.port)
        return

    _LOG.info("transport_selected", extra={"transport": "stdio"})
    app.run()


if __name__ == "__main__":  # pragma: no cover - exercised via console script
    main()
