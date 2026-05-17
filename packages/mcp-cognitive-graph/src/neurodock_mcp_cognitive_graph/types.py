"""Pydantic v2 models — the source of truth for tool input/output shapes.

These models conform to the JSON Schemas in
``packages/mcp-cognitive-graph/schemas/`` (v0.1.0). Any divergence between the
schemas and these models is a bug; the schemas are the contract.
"""

from __future__ import annotations

from datetime import date as _date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EntityType = Literal["person", "project", "decision", "concept", "source"]
"""v0.1.0 entity-type taxonomy. Extension is reserved for v0.2."""

Predicate = Literal[
    "mentioned_in",
    "decided_in",
    "reports_to",
    "depends_on",
    "resolved_by",
    "blocked_by",
    "tagged",
    "belongs_to",
]
"""v0.1.0 predicate vocabulary. Adding a predicate is a major bump."""

ResolutionMethod = Literal["exact", "alias", "fuzzy", "embedding", "none"]
"""Resolution methods for ``recall_entity``. v0.0.1 returns exact/alias/none."""


class EntityRef(BaseModel):
    """Reference to an entity by ``type`` and either ``id`` or ``name``."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: EntityType
    id: str | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)


class LiteralValue(BaseModel):
    """Free-text value used when the object of a fact is not an entity."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    literal: str = Field(min_length=1, max_length=1000)


# Re-export under the legacy name expected by ``__init__.py``.
Literal_ = LiteralValue


class EntityRecord(BaseModel):
    """Full entity record returned by ``recall_entity``."""

    model_config = ConfigDict(extra="forbid")

    id: str
    type: EntityType
    name: str
    aliases: list[str] = Field(default_factory=list)
    created_at: datetime


class FactSubject(BaseModel):
    """Resolved subject reference embedded in a Fact."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: EntityType
    id: str
    name: str


class FactObjectEntity(BaseModel):
    """Resolved entity reference used as a fact object."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: EntityType
    id: str
    name: str


FactObject = FactObjectEntity | LiteralValue


class Fact(BaseModel):
    """A typed-edge fact (subject, predicate, object) with metadata."""

    model_config = ConfigDict(extra="forbid")

    id: str
    subject: FactSubject
    predicate: Predicate
    object: FactObject
    source: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    recorded_at: datetime


class RelatedEntity(BaseModel):
    """First-degree neighbour summary returned by ``recall_entity``."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    type: EntityType
    name: str
    co_occurrence_count: int = Field(ge=1)


class Resolution(BaseModel):
    """Diagnostic for how the input was alias-resolved."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    method: ResolutionMethod
    score: float = Field(ge=0.0, le=1.0)


class RecallEntityResult(BaseModel):
    """Output shape of ``recall_entity``."""

    model_config = ConfigDict(extra="forbid")

    entity: EntityRecord | None
    facts: list[Fact]
    related_entities: list[RelatedEntity]
    resolution: Resolution
    truncated_facts: bool = False


class AutoCreatedEntity(BaseModel):
    """Entity created as a side effect of ``record_fact``."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    type: EntityType
    name: str


class RecordFactResult(BaseModel):
    """Output shape of ``record_fact``."""

    model_config = ConfigDict(extra="forbid")

    fact_id: str
    recorded_at: datetime
    subject: FactSubject
    predicate: Predicate
    object: FactObject
    deduplicated: bool = False
    auto_created_entities: list[AutoCreatedEntity] = Field(default_factory=list)


class DecisionAttributor(BaseModel):
    """An entity credited with a decision."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    type: EntityType
    id: str
    name: str


class Decision(BaseModel):
    """A decision returned by ``recall_decisions`` and ``weekly_rollup``."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    decided_on: _date
    decided_by: list[DecisionAttributor] = Field(default_factory=list)
    source: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    supersedes: str | None = None


class ProjectRef(BaseModel):
    """Resolved project reference for ``recall_decisions`` output."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    name: str


class RecallDecisionsResult(BaseModel):
    """Output shape of ``recall_decisions``."""

    model_config = ConfigDict(extra="forbid")

    project: ProjectRef | None
    decisions: list[Decision]
    truncated: bool = False
    since: _date | None = None


class Period(BaseModel):
    """Local-date window covered by a ``weekly_rollup``."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    start: _date
    end: _date


class RollupDecision(BaseModel):
    """Slim decision shape inside ``weekly_rollup`` (no ``supersedes``)."""

    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    decided_on: _date
    decided_by: list[DecisionAttributor] = Field(default_factory=list)
    source: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)


class WeeklyRollupResult(BaseModel):
    """Output shape of ``weekly_rollup``."""

    model_config = ConfigDict(extra="forbid")

    project: str | None
    period: Period
    summary: str = Field(max_length=4000)
    decisions: list[RollupDecision]
    blockers: list[Fact]
    next_actions: list[str]
    generated_at: datetime
