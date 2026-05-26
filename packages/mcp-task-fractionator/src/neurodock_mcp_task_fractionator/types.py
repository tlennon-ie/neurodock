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
    """A single atomic task. Shape is shared by ``decompose`` and ``next_one``."""

    id: str = Field(pattern=UUID4_PATTERN)
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=1000)
    estimated_minutes: int = Field(ge=5, le=90)
    acceptance_criteria: list[str] = Field(min_length=1, max_length=8)
    dependencies: list[str] = Field(default_factory=list)
    sequence: int = Field(ge=1)
    tags: list[str] = Field(default_factory=list)


class DecomposeInput(_Base):
    """Input arguments for ``decompose``. Validated at the server boundary."""

    goal: str = Field(min_length=5, max_length=500)
    time_budget: str | None = None


class DecomposeOutput(_Base):
    """Successful response from ``decompose``."""

    tasks: list[Task] = Field(min_length=1, max_length=20)
    rationale: str = Field(min_length=1, max_length=1000)


class NextOneInput(_Base):
    """Input arguments for ``next_one``."""

    project: str = Field(min_length=1, max_length=120)


class NextOneOutput(_Base):
    """Successful response from ``next_one``."""

    task: Task
    reasoning: str = Field(min_length=1, max_length=600)
    confidence: float = Field(ge=0.0, le=1.0)
