"""Entity resolution.

v0.0.1 implements the first two rungs of the cascade defined in the schema:

* ``exact``  — case-sensitive (type, name) hit.
* ``alias``  — case-insensitive match on ``name`` or any recorded alias.

``fuzzy`` and ``embedding`` are reserved for v0.0.2 (see CHANGELOG); the
``resolution.method`` enum in the schema already permits the full cascade.
"""

from __future__ import annotations

from dataclasses import dataclass

from neurodock_mcp_cognitive_graph.storage.base import EntityRow, Storage
from neurodock_mcp_cognitive_graph.types import EntityType, ResolutionMethod


@dataclass(frozen=True)
class ResolutionResult:
    """Outcome of an alias-resolve attempt."""

    entity: EntityRow | None
    method: ResolutionMethod
    score: float


def resolve(
    storage: Storage,
    name_or_alias: str,
    *,
    preferred_type: EntityType | None = None,
) -> ResolutionResult:
    """Look up an entity by name or alias.

    The cascade is:

    1. If ``preferred_type`` is provided, try an exact (type, name) match.
    2. Try any-type exact name match (case-sensitive). Method=``exact``.
    3. Try case-insensitive name + alias match. Method=``alias``.

    Returns a :class:`ResolutionResult` with ``entity=None`` and method
    ``none`` when nothing matched.
    """
    needle = name_or_alias.strip()
    if not needle:
        return ResolutionResult(entity=None, method="none", score=0.0)

    if preferred_type is not None:
        hit = storage.find_entity_exact(preferred_type, needle)
        if hit is not None:
            return ResolutionResult(entity=hit, method="exact", score=1.0)

    hit = storage.find_entity_by_name_any_type(needle)
    if hit is not None:
        return ResolutionResult(entity=hit, method="exact", score=1.0)

    alias_hit = storage.find_entity_by_alias(needle)
    if alias_hit is not None:
        # Score reflects case-insensitive match. Exact-case would have been
        # caught above; here we are still confident but not perfect.
        return ResolutionResult(entity=alias_hit, method="alias", score=0.95)

    return ResolutionResult(entity=None, method="none", score=0.0)
