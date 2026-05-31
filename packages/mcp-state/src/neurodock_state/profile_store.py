# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Per-user profile contract (ADR 0010 Phase B — definition only).

The NeuroDock profile (``~/.neurodock/profile.yaml`` locally) holds the user's
neurotype-aware preferences. To make that per-user on the hosted/BYOS path, this
module defines the :class:`ProfileStore` protocol. The profile is treated as an
opaque ``dict`` here — schema validation stays in the layers that own it. Phase B
ships the contract plus :class:`InMemoryProfileStore` for tests.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Protocol, runtime_checkable

from neurodock_state.identity import UserKey


@runtime_checkable
class ProfileStore(Protocol):
    """The contract a per-user profile backing must satisfy.

    Implementations isolate profiles per :class:`UserKey`.
    """

    def get_profile(self, user: UserKey) -> dict[str, Any] | None:
        """Return ``user``'s profile dict, or ``None`` if none is stored."""
        ...

    def put_profile(self, user: UserKey, profile: dict[str, Any]) -> None:
        """Store (replacing any existing) ``user``'s profile dict."""
        ...


class InMemoryProfileStore:
    """Dict-backed reference :class:`ProfileStore`. Per-user, no persistence.

    Stores defensive deep copies so callers cannot mutate stored state through
    a retained reference (the project's immutability convention).
    """

    def __init__(self) -> None:
        self._profiles: dict[str, dict[str, Any]] = {}

    def get_profile(self, user: UserKey) -> dict[str, Any] | None:
        stored = self._profiles.get(user.storage_key)
        if stored is None:
            return None
        return deepcopy(stored)

    def put_profile(self, user: UserKey, profile: dict[str, Any]) -> None:
        self._profiles[user.storage_key] = deepcopy(profile)
