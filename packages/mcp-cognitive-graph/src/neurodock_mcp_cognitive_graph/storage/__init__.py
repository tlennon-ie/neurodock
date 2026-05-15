"""Storage abstraction for the cognitive graph.

The :class:`Storage` protocol is the only contract that tool implementations
depend on. Two concrete backings exist in v0.0.1:

* :class:`SQLiteStorage` — durable, file-backed (production).
* :class:`InMemoryStorage` — pure-Python, used in tests for determinism.

Both implement identical semantics; the protocol is the contract.
"""

from neurodock_mcp_cognitive_graph.storage.base import (
    DEFAULT_FACTS_CAP,
    DEFAULT_RELATED_CAP,
    EntityRow,
    FactRow,
    Storage,
)
from neurodock_mcp_cognitive_graph.storage.memory import InMemoryStorage
from neurodock_mcp_cognitive_graph.storage.sqlite import SQLiteStorage

__all__ = [
    "DEFAULT_FACTS_CAP",
    "DEFAULT_RELATED_CAP",
    "EntityRow",
    "FactRow",
    "InMemoryStorage",
    "SQLiteStorage",
    "Storage",
]
