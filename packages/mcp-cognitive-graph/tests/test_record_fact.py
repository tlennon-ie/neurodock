"""Tests for the ``record_fact`` tool."""

from __future__ import annotations

import pytest
from neurodock_mcp_cognitive_graph.clock import FixedClock
from neurodock_mcp_cognitive_graph.errors import ToolError
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.tools.record_fact import record_fact


def test_stores_and_returns_canonical_id(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    result = record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "person", "name": "Roberto"},
        predicate="decided_in",
        object={"type": "decision", "name": "Adopt SQLite + sqlite-vec"},
        source="msg://slack/C123/p1715683200000100",
        confidence=1.0,
    )
    assert result.fact_id.startswith("fact_")
    assert result.predicate == "decided_in"
    assert result.deduplicated is False
    auto_names = {e.name for e in result.auto_created_entities}
    assert "Roberto" in auto_names
    assert "Adopt SQLite + sqlite-vec" in auto_names


def test_unknown_predicate_raises_vocabulary_error(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    with pytest.raises(ToolError) as exc_info:
        record_fact(
            memory_storage,
            fixed_clock,
            subject={"type": "person", "name": "Roberto"},
            predicate="hugs",
            object={"type": "person", "name": "Priya"},
        )
    assert exc_info.value.code == "PREDICATE_NOT_IN_VOCABULARY"
    # The error message must include at least one valid predicate so the caller
    # immediately knows what values are accepted (fix #9).
    from neurodock_mcp_cognitive_graph.tools._shared import PREDICATE_VOCABULARY

    assert any(p in exc_info.value.args[0] for p in PREDICATE_VOCABULARY)


def test_duplicate_returns_same_id_with_deduplicated_true(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    first = record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="depends_on",
        object={"type": "concept", "name": "sqlite-vec"},
    )
    second = record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="depends_on",
        object={"type": "concept", "name": "sqlite-vec"},
        source="https://github.com/assafkip/kipi-system",
        confidence=0.95,
    )
    assert second.fact_id == first.fact_id
    assert second.deduplicated is True
    # Auto-creation should be empty on the second call.
    assert second.auto_created_entities == []


def test_literal_object_is_accepted(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    result = record_fact(
        memory_storage,
        fixed_clock,
        subject={"type": "project", "name": "kipi-system"},
        predicate="tagged",
        object={"literal": "external-memory"},
        confidence=0.8,
    )
    assert result.deduplicated is False
    # object should be a literal payload, not an entity payload.
    assert result.object.model_dump() == {"literal": "external-memory"}


def test_invalid_confidence_raises(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    with pytest.raises(ToolError) as exc_info:
        record_fact(
            memory_storage,
            fixed_clock,
            subject={"type": "person", "name": "Roberto"},
            predicate="reports_to",
            object={"type": "person", "name": "Priya"},
            confidence=2.0,
        )
    assert exc_info.value.code == "CONFIDENCE_OUT_OF_RANGE"


# --- Friendly-error UX tests (record_fact friction fix) ---------------------
#
# These cover the three failure modes the user actually hit on 2026-05-22.
# Each asserts (a) the correct error code, (b) the friendly hint is present
# and tells the caller what to do, and (c) an example payload is attached
# so a follow-up call can succeed on the next try, not the fifth.


def test_string_subject_returns_friendly_shape_hint(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """Reproduces failure mode 1: caller passes a bare string for subject."""
    with pytest.raises(ToolError) as exc_info:
        record_fact(
            memory_storage,
            fixed_clock,
            subject="Roberto",  # bare string instead of {type, name} object
            predicate="reports_to",
            object={"type": "person", "name": "Priya"},
        )
    err = exc_info.value
    assert err.code == "SUBJECT_REQUIRED"
    assert err.hint is not None
    # Tells the caller the shape it actually wants.
    assert "type" in err.hint and "name" in err.hint
    # Tells the caller what was received, so they can see the mismatch.
    assert "bare string" in err.message or "'Roberto'" in err.message
    # Carries a copy-pasteable example.
    assert err.example is not None
    assert err.example["subject"]["type"] == "person"
    assert err.example["predicate"] in {
        "decided_in",
        "mentioned_in",
        "reports_to",
        "depends_on",
        "resolved_by",
        "blocked_by",
        "tagged",
        "belongs_to",
    }


def test_unknown_predicate_lists_full_vocabulary_in_hint(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """Reproduces failure mode 2: caller invents a predicate (`has_bug`)."""
    with pytest.raises(ToolError) as exc_info:
        record_fact(
            memory_storage,
            fixed_clock,
            subject={"type": "concept", "name": "extension"},
            predicate="has_bug",  # invented predicate, not in vocabulary
            object={"literal": "stream completes but result never reaches DOM"},
        )
    err = exc_info.value
    assert err.code == "PREDICATE_NOT_IN_VOCABULARY"
    assert err.hint is not None
    # All eight valid predicates must appear in the hint so the caller can
    # pick the closest match in one read.
    from neurodock_mcp_cognitive_graph.tools._shared import PREDICATE_VOCABULARY

    for predicate in PREDICATE_VOCABULARY:
        assert predicate in err.hint, f"hint missing predicate {predicate!r}"
    # The hint specifically nudges bug/blocker callers toward `blocked_by`,
    # because that was the actual happy-path the 2026-05-22 user landed on.
    assert "blocked_by" in err.hint


def test_invalid_entity_type_nudges_toward_concept(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """Reproduces failure mode 3: caller uses `feature` (or similar) as type."""
    with pytest.raises(ToolError) as exc_info:
        record_fact(
            memory_storage,
            fixed_clock,
            subject={"type": "feature", "name": "gmail-translate"},  # not in taxonomy
            predicate="blocked_by",
            object={"type": "concept", "name": "lm-studio-silent-failure"},
        )
    err = exc_info.value
    assert err.code == "ENTITY_TYPE_UNKNOWN"
    assert err.hint is not None
    # The caller is told the actual valid set and steered to `concept`.
    for valid in ("person", "project", "decision", "concept", "source"):
        assert valid in err.hint
    assert "concept" in err.hint
    # The original Pydantic-style detail (what was received) is preserved
    # for debuggability — the friendly hint sits *alongside* the technical
    # message, not in place of it.
    assert "'feature'" in err.message


def test_subject_missing_name_and_id_returns_actionable_hint(
    memory_storage: InMemoryStorage,
    fixed_clock: FixedClock,
) -> None:
    """Edge of failure mode 1: well-formed dict but missing identity field."""
    with pytest.raises(ToolError) as exc_info:
        record_fact(
            memory_storage,
            fixed_clock,
            subject={"type": "person"},  # type only, no name or id
            predicate="reports_to",
            object={"type": "person", "name": "Priya"},
        )
    err = exc_info.value
    assert err.code == "SUBJECT_REQUIRED"
    assert err.hint is not None
    assert "name" in err.hint
    assert err.example is not None


def test_payload_includes_hint_and_example_fields() -> None:
    """The payload shape sent to the MCP caller must carry the new fields."""
    from neurodock_mcp_cognitive_graph.errors import ToolError as TE

    err = TE(
        "SUBJECT_REQUIRED",
        "subject must be an object.",
        hint="Pass `subject` as an object with `type` and `name`.",
        example={"subject": {"type": "person", "name": "Roberto"}},
    )
    payload = err.to_payload()
    assert payload["error"] == "SUBJECT_REQUIRED"
    assert payload["message"] == "subject must be an object."
    assert payload["hint"].startswith("Pass `subject`")
    assert payload["example"]["subject"]["name"] == "Roberto"


def test_payload_omits_hint_and_example_when_absent() -> None:
    """Backwards compat: an old-style ToolError still serialises cleanly."""
    from neurodock_mcp_cognitive_graph.errors import ToolError as TE

    payload = TE("GRAPH_WRITE_FAILED", "disk full").to_payload()
    assert payload == {"error": "GRAPH_WRITE_FAILED", "message": "disk full"}
