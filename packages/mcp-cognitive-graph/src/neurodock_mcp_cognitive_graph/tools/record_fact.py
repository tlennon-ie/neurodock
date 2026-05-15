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


def _validate_confidence(confidence: float | None) -> float:
    if confidence is None:
        return 1.0
    try:
        value = float(confidence)
    except (TypeError, ValueError) as exc:
        raise ToolError(
            "CONFIDENCE_OUT_OF_RANGE",
            "confidence must be a number in [0, 1].",
        ) from exc
    if not (0.0 <= value <= 1.0):
        raise ToolError(
            "CONFIDENCE_OUT_OF_RANGE",
            f"confidence {value} not in [0, 1].",
        )
    return value


def _validate_source(source: str | None) -> None:
    if source is None:
        return
    if not isinstance(source, str):
        raise ToolError("OBJECT_REQUIRED", "source must be a string or null.")
    if len(source) > 2000:
        raise ToolError("OBJECT_REQUIRED", "source exceeds 2000 characters.")


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
        raise ToolError(
            "PREDICATE_NOT_IN_VOCABULARY",
            f"predicate '{predicate}' is not in the v0.1.0 controlled vocabulary.",
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
