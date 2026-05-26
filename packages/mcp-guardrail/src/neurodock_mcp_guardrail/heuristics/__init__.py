# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Detection heuristics for ``mcp-guardrail``.

Per ``ETHICS.md`` commitment 3, every heuristic ships its source code in the
open. The :class:`Heuristic` protocol is the common shape; each concrete
heuristic lives in its own module under this package.
"""

from __future__ import annotations

from typing import Protocol


class Heuristic(Protocol):
    """Common shape every guardrail heuristic implements.

    A heuristic is a pure function plus its descriptive metadata. The
    ``description`` is what users see when they audit a detection; it is part
    of the auditability contract from ``ETHICS.md`` commitment 3.
    """

    name: str
    version: str
    description: str
