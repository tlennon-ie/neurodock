"""Unit tests for ``rewrite_outgoing``."""

from __future__ import annotations

import pytest
from neurodock_mcp_translation.tools.rewrite_outgoing import rewrite_outgoing
from neurodock_mcp_translation.types import RewriteOutgoingInput
from pydantic import ValidationError


def test_preserves_explicit_terms() -> None:
    """Preserve_terms that survive the baseline transform appear in preserved_terms."""

    payload = RewriteOutgoingInput(
        text="Strong nack. The approach in section 3 will not scale and we need to revisit before merge.",
        target_register="direct",
        preserve_terms=["section 3"],
        channel="github",
    )
    result = rewrite_outgoing(payload)
    assert "section 3" in result.deterministic_analysis.rewritten
    assert result.deterministic_analysis.preserved_terms == ["section 3"]
    assert result.deterministic_analysis.unpreserved_terms == []


def test_surfaces_unpreserved_terms_when_baseline_drops_them() -> None:
    """A term the baseline does not retain must appear in unpreserved_terms with a warning."""

    payload = RewriteOutgoingInput(
        text="This is broken. Please fix before EOD.",
        target_register="warm",
        preserve_terms=["EOD", "GraphQL"],
    )
    result = rewrite_outgoing(payload)
    # GraphQL is not in the source, so the baseline rewrite cannot include it.
    assert "GraphQL" in result.deterministic_analysis.unpreserved_terms
    # EOD is present.
    assert "EOD" in result.deterministic_analysis.preserved_terms
    # A warning is emitted.
    warnings = result.deterministic_analysis.diff_summary.warnings
    assert any("GraphQL" in warning for warning in warnings)


def test_produces_deterministic_diff_summary() -> None:
    """The diff_summary has a non-empty tone_shift and structural_changes list."""

    payload = RewriteOutgoingInput(
        text="Strong nack. The approach in section 3 will not scale.",
        target_register="warm",
    )
    result = rewrite_outgoing(payload)
    summary = result.deterministic_analysis.diff_summary
    assert summary.tone_shift  # non-empty
    assert len(summary.structural_changes) >= 1
    # Two runs with the same input are identical (server-side determinism).
    again = rewrite_outgoing(payload)
    assert result.deterministic_analysis.rewritten == again.deterministic_analysis.rewritten
    assert (
        summary.structural_changes == again.deterministic_analysis.diff_summary.structural_changes
    )


def test_missing_target_register_raises_validation_error() -> None:
    with pytest.raises(ValidationError):
        RewriteOutgoingInput(text="hello")  # type: ignore[call-arg]


def test_unknown_target_register_raises_validation_error() -> None:
    with pytest.raises(ValidationError):
        RewriteOutgoingInput(text="hello", target_register="bossy")  # type: ignore[arg-type]


def test_warm_register_adds_relational_opener() -> None:
    """Warm register prepends a relational opener when the message has none."""

    payload = RewriteOutgoingInput(
        text="This is broken. Please fix before EOD.",
        target_register="warm",
        preserve_terms=["EOD"],
    )
    result = rewrite_outgoing(payload)
    # The relational opener is added.
    assert result.deterministic_analysis.rewritten.lower().startswith("hey")
    # EOD is preserved.
    assert "EOD" in result.deterministic_analysis.rewritten


def test_concise_register_drops_hedges() -> None:
    """The 'concise' baseline drops common hedge tokens."""

    payload = RewriteOutgoingInput(
        text="I think maybe we should just revisit the rollout plan.",
        target_register="concise",
    )
    result = rewrite_outgoing(payload)
    rewritten = result.deterministic_analysis.rewritten.lower()
    # At least one hedge has been dropped.
    assert "i think " not in rewritten or "maybe " not in rewritten or "just " not in rewritten
    # Changes list mentions a hedge removal.
    changes = result.deterministic_analysis.diff_summary.structural_changes
    assert any("hedge" in change.lower() for change in changes)


def test_formal_register_expands_contractions() -> None:
    """The 'formal' baseline expands won't/can't."""

    payload = RewriteOutgoingInput(
        text="We won't ship this. We can't get the migration in by Friday.",
        target_register="formal",
    )
    result = rewrite_outgoing(payload)
    rewritten = result.deterministic_analysis.rewritten
    assert "won't" not in rewritten
    assert "can't" not in rewritten
    assert "will not" in rewritten
    assert "cannot" in rewritten


def test_clarifying_register_reframes_as_question() -> None:
    """The 'clarifying' baseline appends a clarifying question."""

    payload = RewriteOutgoingInput(
        text="The current plan does not feel right.",
        target_register="clarifying",
    )
    result = rewrite_outgoing(payload)
    assert result.deterministic_analysis.rewritten.endswith("?")
    assert "could you confirm" in result.deterministic_analysis.rewritten.lower()
