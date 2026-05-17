"""Shared fixtures for ``mcp-guardrail`` tests.

The server is stateless, so fixtures are intentionally minimal: there is no
state to reset between tests, no clock to inject, no profile path to redirect.
The only shared helper is the schema loader used by the protocol conformance
test.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

SCHEMAS_DIR = Path(__file__).resolve().parents[1] / "schemas"


def _load_schema(filename: str) -> dict[str, Any]:
    raw = (SCHEMAS_DIR / filename).read_text(encoding="utf-8")
    return json.loads(raw)


@pytest.fixture
def load_schema() -> Any:
    """Return a function that loads a guardrail JSON schema by filename."""

    def _loader(filename: str) -> dict[str, Any]:
        return _load_schema(filename)

    return _loader
