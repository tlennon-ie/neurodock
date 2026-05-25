"""``record_fact`` tool implementation.

Open question 2 of ADR 0002 is resolved here as **option 2 (append-only with
logical fact id)**: a second insert of the same ``(subject, predicate, object)``
triple returns the canonical ``fact_id`` and surfaces ``deduplicated=true``;
the new source/confidence is captured in the ``fact_provenance`` log so
provenance is preserved.
"""

from __future__ import annotations

from typing import Any, cast

from neurodock_mcp_cognitive_graph.clock import Clock
from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.storage.base import FactRow, Storage
from neurodock_mcp_cognitive_graph.tools._entities import resolve_object, resolve_subject
from neurodock_mcp_cognitive_graph.tools._shared import (
    PREDICATE_VOCABULARY,
    new_fact_id,
)
from neurodock_mcp_cognitive_graph.types import Predicate, RecordFactResult

# A minimal, copy-pasteable valid call. Surfaced in friendly errors so the
# caller can see the expected shape without reading the schema.
_VALID_CALL_EXAMPLE: dict[str, Any] = {
    "subject": {"type": "person", "name": "Roberto"},
    "predicate": "decided_in",
    "object": {"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
}


def _validate_confidence(confidence: float | None) -> float:
    if confidence is None:
        return 1.0
    try:
        value = float(confidence)
    except (TypeError, ValueError) as exc:
        raise ToolError(
            "CONFIDENCE_OUT_OF_RANGE",
            "confidence must be a number in [0, 1].",
            hint=("Pass confidence as a number between 0 and 1, or omit it to default to 1.0."),
            example={**_VALID_CALL_EXAMPLE, "confidence": 0.8},
        ) from exc
    if not (0.0 <= value <= 1.0):
        raise ToolError(
            "CONFIDENCE_OUT_OF_RANGE",
            f"confidence {value} not in [0, 1].",
            hint=(
                "Confidence must sit in the closed interval [0, 1]. "
                "Use 1.0 for declarative facts and lower values for inferred ones."
            ),
            example={**_VALID_CALL_EXAMPLE, "confidence": 0.8},
        )
    return value


def _validate_source(source: str | None) -> None:
    if source is None:
        return
    if not isinstance(source, str):
        raise ToolError(
            "OBJECT_REQUIRED",
            "source must be a string or null.",
            hint="Pass `source` as a string (URL, message id, citation) or omit it.",
            example={
                **_VALID_CALL_EXAMPLE,
                "source": "https://github.com/neurodock/neurodock/issues/42",
            },
        )
    if len(source) > 2000:
        raise ToolError(
            "OBJECT_REQUIRED",
            "source exceeds 2000 characters.",
            hint="Trim `source` to under 2000 characters; it is stored verbatim, not fetched.",
        )


def record_fact(
    storage: Storage,
    clock: Clock,
    *,
    subject: Any,
    predicate: Any,
    object: Any,
    source: str | None = None,
    confidence: float | None = None,
) -> RecordFactResult:
    """Persist a (subject, predicate, object) fact and return its canonical id."""
    if predicate not in PREDICATE_VOCABULARY:
        valid = sorted(PREDICATE_VOCABULARY)
        raise ToolError(
            "PREDICATE_NOT_IN_VOCABULARY",
            f"predicate '{predicate}' is not in the v0.1.0 controlled vocabulary."
            f" Valid predicates: {valid}.",
            hint=(
                f"Pick a `predicate` from this fixed list: {', '.join(valid)}. "
                "For a bug or blocker, try `blocked_by`. For tagging, use `tagged`. "
                "Predicates are not free-text in v0.1."
            ),
            example=_VALID_CALL_EXAMPLE,
        )
    pred = cast(Predicate, predicate)
    confidence_value = _validate_confidence(confidence)
    _validate_source(source)

    now = clock.now()
    subject_ref, auto1 = resolve_subject(storage, subject, now)
    object_id, object_literal, object_payload, auto2 = resolve_object(storage, object, now)
    auto_created = auto1 + auto2

    canonical = storage.find_fact_canonical(
        subject_id=subject_ref.id,
        predicate=pred,
        object_id=object_id,
        object_literal=object_literal,
    )
    if canonical is not None:
        storage.insert_provenance(
            canonical_fact_id=canonical.id,
            source=source,
            confidence=confidence_value,
            recorded_at=now,
        )
        return RecordFactResult(
            fact_id=canonical.id,
            recorded_at=canonical.recorded_at,
            subject=subject_ref,
            predicate=pred,
            object=object_payload,
            deduplicated=True,
            auto_created_entities=auto_created,
        )

    fact_row = FactRow(
        id=new_fact_id(),
        subject_id=subject_ref.id,
        predicate=pred,
        object_kind="entity" if object_id is not None else "literal",
        object_id=object_id,
        object_literal=object_literal,
        source=source,
        confidence=confidence_value,
        recorded_at=now,
    )
    storage.insert_fact(fact_row)

    return RecordFactResult(
        fact_id=fact_row.id,
        recorded_at=fact_row.recorded_at,
        subject=subject_ref,
        predicate=pred,
        object=object_payload,
        deduplicated=False,
        auto_created_entities=auto_created,
    )
