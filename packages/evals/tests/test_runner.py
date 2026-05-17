"""Runner integration tests against the translation deterministic baselines."""

from __future__ import annotations

import pytest
from neurodock_evals.corpus import load_slice
from neurodock_evals.runner import run_example


@pytest.mark.parametrize(
    ("slice_id", "tool"),
    [
        ("translation/incoming", "translate_incoming"),
        ("translation/tone", "check_tone"),
        ("translation/outgoing", "rewrite_outgoing"),
        ("translation/meetings", "brief_meeting"),
    ],
)
def test_every_seed_example_runs_through_its_tool(slice_id: str, tool: str) -> None:
    examples = load_slice(slice_id)
    for example in examples:
        result = run_example(example, tool_name=tool)
        assert result.schema_valid, f"{example.id}: input failed Pydantic validation"
        assert result.error is None, f"{example.id}: runner raised {result.error}"


def test_seed_examples_meet_default_threshold() -> None:
    """The seed examples are calibrated to pass the deterministic baseline."""

    pairs = (
        ("translation/incoming", "translate_incoming"),
        ("translation/tone", "check_tone"),
        ("translation/outgoing", "rewrite_outgoing"),
        ("translation/meetings", "brief_meeting"),
    )
    failures: list[str] = []
    for slice_id, tool in pairs:
        for example in load_slice(slice_id):
            result = run_example(example, tool_name=tool)
            if not result.passed:
                failures.append(
                    f"{example.id} -> score={result.score:.3f} deltas={result.deltas!r}"
                )
    assert not failures, "Seed example regressed:\n" + "\n".join(failures)


def test_runner_does_not_leak_example_text_in_run_result() -> None:
    """Privacy invariant: RunResult must not contain the example body."""

    examples = load_slice("translation/incoming")
    example = examples[0]
    result = run_example(example, tool_name="translate_incoming")
    body = example.input.get("text", "")
    assert isinstance(body, str)
    dumped = result.model_dump_json()
    assert body not in dumped, "Example body must not leak into RunResult"
