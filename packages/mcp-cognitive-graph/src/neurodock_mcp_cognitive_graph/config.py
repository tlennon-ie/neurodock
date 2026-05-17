"""Configuration loading.

For v0.0.1 we only need to know where the SQLite store lives. Profile-level
overrides (alias thresholds, embedding provider) land in later versions.
"""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_DB_PATH = Path.home() / ".neurodock" / "cognitive-graph.sqlite"
ENV_DB_PATH = "NEURODOCK_GRAPH_DB_PATH"


def resolve_db_path() -> Path:
    """Return the configured SQLite store path.

    Order of precedence:
    1. ``NEURODOCK_GRAPH_DB_PATH`` environment variable.
    2. ``~/.neurodock/cognitive-graph.sqlite``.
    """
    override = os.environ.get(ENV_DB_PATH)
    if override:
        return Path(override)
    return DEFAULT_DB_PATH
