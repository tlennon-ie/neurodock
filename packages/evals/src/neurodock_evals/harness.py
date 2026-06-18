# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""CLI entrypoint for the eval harness.

Examples:

    # Run a single slice against a named tool
    python -m neurodock_evals.harness \
        --corpus translation/incoming --tool translate_incoming

    # Run every slice the harness knows about (default CI mode)
    python -m neurodock_evals.harness --ci

The harness writes a JSON report to `.eval-reports/<timestamp>-<slug>.json`
and exits non-zero if any example regresses below the configured threshold
(default 0.6 on field-level agreement).

Privacy invariant: the report contains example IDs + scores only — never
verbatim example text. The runner is air-gapped (no LLM SDK imports).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Final

from neurodock_evals.corpus import iter_slices, load_slice
from neurodock_evals.runner import DEFAULT_PASS_THRESHOLD, run_example
from neurodock_evals.scoring import neurotype_scores
from neurodock_evals.types import CorpusExample, RunResult, ScoreReport, SliceScore

logger = logging.getLogger(__name__)

# Per-slice tool binding. The four tool-family slices, plus the cross-cutting
# per-neurotype slice (R6) bound to translate_incoming — its examples carry the
# `neurotypes` tag the harness aggregates on, in addition to the per-tool view.
SLICE_TO_TOOL: Final[dict[str, str]] = {
    "translation/incoming": "translate_incoming",
    "translation/tone": "check_tone",
    "translation/outgoing": "rewrite_outgoing",
    "translation/meetings": "brief_meeting",
    "translation/neurotype": "translate_incoming",
}


def _resolve_tool_for_slice(slice_id: str, override: str | None) -> str:
    if override:
        return override
    if slice_id in SLICE_TO_TOOL:
        return SLICE_TO_TOOL[slice_id]
    raise SystemExit(
        f"No tool binding for slice {slice_id!r}; pass --tool explicitly. "
        f"Known bindings: {sorted(SLICE_TO_TOOL)}"
    )


def _slice_scores(results: list[RunResult]) -> list[SliceScore]:
    by_slice: dict[tuple[str, str], list[RunResult]] = {}
    for result in results:
        by_slice.setdefault((result.slice, result.tool), []).append(result)
    out: list[SliceScore] = []
    for (slice_id, tool), group in sorted(by_slice.items()):
        total = len(group)
        passed = sum(1 for r in group if r.passed)
        # A grouped entry always has >=1 member, so `total` is never 0 here; the
        # guard is defensive and mirrors scoring.neurotype_scores for consistency.
        mean = sum(r.score for r in group) / total if total else 0.0
        out.append(
            SliceScore(slice=slice_id, tool=tool, total=total, passed=passed, mean_score=mean)
        )
    return out


def _write_report(report: ScoreReport, reports_dir: Path, slug: str) -> Path:
    reports_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    out_path = reports_dir / f"{timestamp}-{slug}.json"
    # Pydantic dumps with mode='json' to make datetimes / enums serialisable.
    out_path.write_text(
        json.dumps(report.model_dump(mode="json"), indent=2, sort_keys=False),
        encoding="utf-8",
    )
    return out_path


def _summarise(report: ScoreReport, report_path: Path) -> str:
    lines = [
        f"Wrote eval report -> {report_path}",
        f"Threshold: {report.threshold}",
        "Slice summary:",
    ]
    for slice_score in report.slices:
        lines.append(
            f"  {slice_score.slice} via {slice_score.tool}: "
            f"{slice_score.passed}/{slice_score.total} passed "
            f"(mean score {slice_score.mean_score:.3f})"
        )
    if report.neurotype_scores:
        lines.append("Per-neurotype summary:")
        for nt_score in report.neurotype_scores:
            lines.append(
                f"  {nt_score.neurotype}: "
                f"{nt_score.passed}/{nt_score.total} passed "
                f"(mean score {nt_score.mean_score:.3f})"
            )
    lines.append(f"Overall: {'PASS' if report.overall_passed else 'FAIL'}")
    return "\n".join(lines)


def run(
    corpora: list[str],
    tool_override: str | None,
    threshold: float,
    reports_dir: Path,
) -> tuple[ScoreReport, Path]:
    results: list[RunResult] = []
    all_examples: list[CorpusExample] = []
    for slice_id in corpora:
        tool_name = _resolve_tool_for_slice(slice_id, tool_override)
        examples = load_slice(slice_id)
        all_examples.extend(examples)
        for example in examples:
            result = run_example(example, tool_name=tool_name, pass_threshold=threshold)
            results.append(result)
    overall_passed = all(r.passed for r in results) if results else True
    report = ScoreReport(
        generated_at=datetime.now(UTC).isoformat(),
        threshold=threshold,
        overall_passed=overall_passed,
        slices=_slice_scores(results),
        neurotype_scores=neurotype_scores(results, all_examples),
        results=results,
    )
    slug = "ci" if not tool_override else tool_override
    report_path = _write_report(report, reports_dir, slug)
    return report, report_path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="neurodock_evals.harness",
        description="Run NeuroDock eval corpora against the deterministic baselines.",
    )
    parser.add_argument(
        "--corpus",
        type=str,
        action="append",
        default=None,
        help="Slice ID, e.g. 'translation/incoming'. May be passed multiple times.",
    )
    parser.add_argument(
        "--tool",
        type=str,
        default=None,
        help="Override the tool binding (defaults to the per-slice mapping).",
    )
    parser.add_argument(
        "--ci",
        action="store_true",
        help="Run every slice the harness can discover under corpora/.",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=DEFAULT_PASS_THRESHOLD,
        help="Pass threshold (0..1) on field-level agreement. Default: 0.6.",
    )
    parser.add_argument(
        "--reports-dir",
        type=Path,
        default=Path(".eval-reports"),
        help="Where to write report JSON. Defaults to ./.eval-reports/",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

    if args.ci and args.corpus:
        parser.error("Pass either --ci or --corpus, not both.")

    if args.ci:
        corpora = [s for s in iter_slices() if s in SLICE_TO_TOOL]
        if not corpora:
            logger.warning("--ci found no slices with known tool bindings; nothing to do.")
            return 0
    elif args.corpus:
        corpora = args.corpus
    else:
        # Default behaviour (e.g. nightly workflow with no args): treat as --ci.
        corpora = [s for s in iter_slices() if s in SLICE_TO_TOOL]
        if not corpora:
            logger.info("No corpora discovered; nothing to evaluate.")
            return 0

    report, report_path = run(
        corpora=corpora,
        tool_override=args.tool,
        threshold=args.threshold,
        reports_dir=args.reports_dir,
    )
    sys.stdout.write(_summarise(report, report_path) + "\n")
    return 0 if report.overall_passed else 1


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
