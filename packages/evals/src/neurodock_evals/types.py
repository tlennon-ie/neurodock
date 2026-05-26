# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Pydantic models for the eval harness.

Mirrors `schemas/example.schema.json` and `schemas/annotation.schema.json`.
The harness validates raw YAML against the JSON Schemas first, then parses
into these models for the runner and scorer to consume.

Privacy invariant: NONE of these models carry a `__str__` or `__repr__` that
echoes verbatim example text. The runner builds reports from IDs + scores
only; `RunResult` deliberately omits the example body.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

ExampleStatus = Literal["synthesised", "contributed", "published"]
RaterNeurotype = Literal["adhd", "asd", "audhd", "ocd", "dyslexic", "dyspraxic", "other"]


class _Base(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ConsentBlock(_Base):
    contributor: str = Field(pattern=r"^(anon|synth|curator)-[a-z0-9-]+$")
    consent_token: str = Field(min_length=8)
    anonymisation_pass: int = Field(ge=0)


class RaterAnnotation(_Base):
    rater_id: str = Field(pattern=r"^rater-[A-Za-z0-9-]+$")
    rater_neurotypes: list[RaterNeurotype] = Field(min_length=1, max_length=6)
    agreement_with_expected: float = Field(ge=0.0, le=1.0)
    notes: str | None = Field(default=None, max_length=2000)
    rated_at: str | None = None


class CorpusExample(_Base):
    """A single eval example loaded from disk."""

    id: str = Field(min_length=3, max_length=200)
    slice: str
    created_at: str
    consent: ConsentBlock
    status: ExampleStatus
    license: Literal["AGPL-3.0-or-later"]
    input: dict[str, Any]
    expected: dict[str, Any]
    ratings: list[RaterAnnotation] = Field(default_factory=list, max_length=10)
    notes: str | None = Field(default=None, max_length=2000)


class FieldDelta(_Base):
    """A single field-level disagreement between baseline output and `expected`."""

    path: str
    expected: Any
    actual: Any


class RunResult(_Base):
    """Result of running ONE example through ONE tool.

    Deliberately omits the example's input/output text — only IDs and scores
    travel in reports.
    """

    example_id: str
    slice: str
    tool: str
    passed: bool
    score: float = Field(ge=0.0, le=1.0)
    schema_valid: bool
    deltas: list[FieldDelta] = Field(default_factory=list)
    error: str | None = None


class SliceScore(_Base):
    slice: str
    tool: str
    total: int
    passed: int
    mean_score: float = Field(ge=0.0, le=1.0)


class ScoreReport(_Base):
    """A run summary written under `.eval-reports/`."""

    generated_at: str
    threshold: float
    overall_passed: bool
    slices: list[SliceScore]
    results: list[RunResult]
