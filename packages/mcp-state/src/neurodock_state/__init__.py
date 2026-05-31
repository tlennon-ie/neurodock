# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""NeuroDock per-user state foundation (ADR 0010 Phase B).

This package defines the abstractions that let the stateful tools (cognitive
graph, chronometric session state, and the profile) be backed by a **per-user**
store keyed by the authenticated user's identity, without changing tool logic.

It ships only *contracts* plus *in-memory reference implementations*. No tool is
wired to these yet, and there is no external infrastructure — that is the
explicit boundary of Phase B. Hosted (Phase C) and BYOS (Phase D) backings plug
in behind the same protocols later.
"""

from __future__ import annotations

from neurodock_state.identity import UserKey, user_key_from_context
from neurodock_state.profile_store import InMemoryProfileStore, ProfileStore
from neurodock_state.registry import (
    GraphStore,
    MemoryBackingResolver,
    StateBackingResolver,
    StorageMode,
)
from neurodock_state.session_store import InMemorySessionStore, Session, SessionStore

__version__ = "0.0.1"

__all__ = [
    "GraphStore",
    "InMemoryProfileStore",
    "InMemorySessionStore",
    "MemoryBackingResolver",
    "ProfileStore",
    "Session",
    "SessionStore",
    "StateBackingResolver",
    "StorageMode",
    "UserKey",
    "__version__",
    "user_key_from_context",
]
