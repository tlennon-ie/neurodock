"""``check_rumination`` tool implementation.

Stateless detector. Given the user's current prompt and recent prior prompts,
return a structured advisory signal carrying:

* whether the rolling-window threshold tripped
* the prior prompts that matched, oldest-first, with their similarity scores
* the heuristic descriptor (auditability — ``ETHICS.md`` commitment 3)
* override options (always non-empty when ``detected`` is true — commitment 2)
* a false-positive feedback path (commitment 5)

The server never persists input or output. See ADR 0006 for the contract.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from neurodock_mcp_guardrail.heuristics.rumination import (
    HEURISTIC_DESCRIPTION,
    HEURISTIC_NAME,
    HEURISTIC_VERSION,
    jaccard_similarity,
)
from neurodock_mcp_guardrail.overrides import rumination_default_override_options
from neurodock_mcp_guardrail.types import (
    DEFAULT_FP_FEEDBACK_PATH,
    HeuristicDescriptor,
    RuminationHistoryItem,
    RuminationInput,
    RuminationOutput,
    RuminationSimilarPrompt,
)


class HistoryOutOfOrderError(ValueError):
    """Raised when history items are not strictly oldest-first by timestamp."""


def _parse_at(at: str) -> datetime:
    """Parse an ISO 8601 timestamp with offset; raise ``ValueError`` otherwise."""
    # ``datetime.fromisoformat`` in 3.11+ supports the full ISO 8601 with
    # offset surface area we accept at the schema boundary.
    return datetime.fromisoformat(at)


def _build_descriptor() -> HeuristicDescriptor:
    return HeuristicDescriptor(
        name=HEURISTIC_NAME,
        version=HEURISTIC_VERSION,
        description=HEURISTIC_DESCRIPTION,
    )


def _filter_history_in_window(
    history: list[RuminationHistoryItem],
    *,
    reference_time: datetime,
    window: timedelta,
) -> list[tuple[RuminationHistoryItem, datetime]]:
    """Return ``(item, parsed_at)`` pairs whose ``at`` is within the window.

    Enforces strictly-ascending ``at`` ordering on the input. Items with
    timestamps in the future relative to ``reference_time`` are silently
    excluded (they cannot be "prior" prompts), but mis-ordering is rejected.
    """
    parsed: list[tuple[RuminationHistoryItem, datetime]] = []
    previous: datetime | None = None
    for item in history:
        moment = _parse_at(item.at)
        if previous is not None and moment < previous:
            raise HistoryOutOfOrderError(
                "history items must be oldest-first by their `at` timestamp"
            )
        previous = moment
        if moment > reference_time:
            continue
        if reference_time - moment <= window:
            parsed.append((item, moment))
    return parsed


def _confidence(matches: list[float], *, threshold: int, similarity_threshold: float) -> float:
    """Compute confidence in the detection.

    Per the schema: blends two signals — how far the match count is past the
    threshold, and how strong the matched similarities are on average. The
    formula is intentionally simple and auditable.
    """
    if not matches:
        # Non-detection: we are most confident when no candidate even came
        # close to the similarity threshold.
        return 0.95
    count_signal = min(1.0, len(matches) / max(threshold, 1))
    spread_signal = sum(matches) / len(matches)
    # 60/40 weighting toward count, since the threshold is the binary trip.
    return round(0.6 * count_signal + 0.4 * spread_signal, 4)


def check_rumination(payload: RuminationInput) -> RuminationOutput:
    """Run the word-overlap Jaccard rumination detector.

    Pure function; no I/O. Raises :class:`HistoryOutOfOrderError` on
    misordered input — the server layer translates this into the schema's
    ``HISTORY_OUT_OF_ORDER`` error code.
    """
    window = timedelta(minutes=payload.window_minutes)
    window_seconds = payload.window_minutes * 60

    # The "reference time" for the rolling window is the latest history item's
    # timestamp when history is non-empty, otherwise we have no anchor and the
    # window is moot. Using the latest history time (rather than wall-clock
    # ``now``) keeps the detector pure: identical inputs produce identical
    # outputs, which is the idempotency contract from ADR 0006.
    if payload.history:
        reference = max(_parse_at(item.at) for item in payload.history)
    else:
        reference = datetime.min.replace(tzinfo=None)

    in_window: list[tuple[RuminationHistoryItem, datetime]]
    if payload.history:
        in_window = _filter_history_in_window(
            payload.history, reference_time=reference, window=window
        )
    else:
        in_window = []

    similar: list[RuminationSimilarPrompt] = []
    scores: list[float] = []
    for item, moment in in_window:
        score = jaccard_similarity(payload.current_prompt, item.text)
        if score >= payload.similarity_threshold:
            similar.append(
                RuminationSimilarPrompt(text=item.text, at=moment.isoformat(), similarity=score)
            )
            scores.append(score)

    count = len(similar)
    detected = count >= payload.threshold_count
    confidence = _confidence(
        scores, threshold=payload.threshold_count, similarity_threshold=payload.similarity_threshold
    )

    if detected:
        reason = (
            f"{count} prompts within {payload.window_minutes} minutes matched this one above "
            f"{payload.similarity_threshold:.2f} word-overlap similarity."
        )
        overrides = rumination_default_override_options()
    else:
        reason = (
            f"{count} prior prompts within {payload.window_minutes} minutes matched this one "
            f"above {payload.similarity_threshold:.2f} word-overlap similarity."
        )
        overrides = []

    return RuminationOutput(
        detected=detected,
        similar_prompts=similar,
        count=count,
        window_seconds=window_seconds,
        threshold=payload.threshold_count,
        confidence=confidence,
        reason=reason,
        heuristic=_build_descriptor(),
        override_options=overrides,
        false_positive_feedback_path=DEFAULT_FP_FEEDBACK_PATH,
    )
