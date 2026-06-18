# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Pydantic v2 models for task fractionator inputs and outputs.

These models mirror the JSON Schemas in
``packages/mcp-task-fractionator/schemas/``. Field names, lengths, and
patterns match the schemas exactly so that round-tripping through the
protocol-conformance test passes.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

# UUIDv4 pattern from the schemas. Same as the chronometric server's.
UUID4_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$"


class _Base(BaseModel):
    """Forbid-extras base for every model in this server."""

    model_config = ConfigDict(extra="forbid")


class Task(_Base):
    """A single atomic task. Shape is shared by ``decompose`` and ``next_one``.

    ``padded_minutes`` is an OPTIONAL, ADDITIVE field (ADR 0011 / R2). It is
    populated only when ``decompose`` is called with a
    ``time_buffer_multiplier`` greater than 1.0; ``estimated_minutes`` always
    stays RAW so a presentation layer never double-pads. When absent it is
    ``None`` and is dropped from the wire (server dumps with
    ``exclude_none=True``).
    """

    id: str = Field(pattern=UUID4_PATTERN)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)
    estimated_minutes: int = Field(ge=5, le=90)
    padded_minutes: int | None = Field(default=None, ge=5)
    acceptance_criteria: list[str] = Field(min_length=1, max_length=8)
    dependencies: list[str] = Field(default_factory=list)
    sequence: int = Field(ge=1)
    tags: list[str] = Field(default_factory=list)


class DecomposeInput(_Base):
    """Input arguments for ``decompose``. Validated at the server boundary.

    The three R2 neurotype-hook inputs are OPTIONAL knobs (ADR 0011): they
    default to today's behaviour when absent and never branch on a neurotype
    enum. They are call-time parameters, exactly like the guardrail server's
    thresholds.
    """

    goal: str = Field(min_length=5, max_length=500)
    time_budget: str | None = None
    max_chunk_size: int | None = Field(default=None, ge=1, le=20)
    time_buffer_multiplier: float | None = Field(default=None, ge=1.0, le=3.0)
    motor_fatigue_aware: bool | None = None


class DecomposeOutput(_Base):
    """Successful response from ``decompose``.

    ``time_buffer_multiplier``, ``motor_fatigue_aware`` and ``truncated`` are
    OPTIONAL, ADDITIVE echoes (ADR 0011 / R2). Each is ``None`` (and dropped
    from the wire) unless the corresponding hook was supplied and active.
    """

    tasks: list[Task] = Field(min_length=1, max_length=20)
    rationale: str = Field(min_length=1, max_length=1000)
    time_buffer_multiplier: float | None = Field(default=None, ge=1.0, le=3.0)
    motor_fatigue_aware: bool | None = None
    truncated: bool | None = None


class NextOneInput(_Base):
    """Input arguments for ``next_one``."""

    project: str = Field(min_length=1, max_length=120)


class NextOneOutput(_Base):
    """Successful response from ``next_one``."""

    task: Task
    reasoning: str = Field(min_length=1, max_length=600)
    confidence: float = Field(ge=0.0, le=1.0)
