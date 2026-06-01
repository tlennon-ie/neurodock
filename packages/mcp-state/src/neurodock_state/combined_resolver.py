# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
"""Combined per-user backing resolver (ADR 0010 Phase C).

NeuroDock now offers two storage modes side by side:

- **hosted** (Phase C) — a NeuroDock-provisioned Turso database per user, via
  :class:`~neurodock_state.hosted_resolver.HostedTursoResolver`.
- **byos** (Phase D)   — the user's own libSQL/Turso connection, via
  :class:`~neurodock_state.byos_resolver.ByosResolver`.

:class:`CombinedResolver` is the :class:`~neurodock_state.registry.StateBackingResolver`
the hosted server wires in. It reads the user's recorded **storage preference**
and routes :meth:`graph_store` / :meth:`storage_mode` to whichever backing the
user chose:

- preference ``mode == "hosted"`` → delegate to the hosted resolver;
- preference ``mode == "byos"``   → delegate to the BYOS resolver;
- otherwise (``"none"`` or no record) → ``"none"`` and a :class:`LookupError`
  from :meth:`graph_store` (the un-gating layer turns that into the structured
  "enable storage first" refusal — nothing is provisioned or read).

The preference record is the single source of truth for *which* mode is active.
This keeps the two backings fully independent: switching modes is a preference
change plus the relevant provision/connect step, and erasing one mode never
touches the other.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from neurodock_state.identity import UserKey
from neurodock_state.registry import GraphStore, StorageMode

if TYPE_CHECKING:  # pragma: no cover - typing only
    from neurodock_state.byos_resolver import ByosResolver
    from neurodock_state.hosted_resolver import HostedTursoResolver
    from neurodock_state.profile_store import ProfileStore
    from neurodock_state.session_store import SessionStore
    from neurodock_state.storage_preference_store import StoragePreferenceStore

_SESSION_PROFILE_DEFERRED = (
    "Hosted/BYOS session/profile persistence is out of scope for ADR 0010 Phase C; "
    "only the four cognitive-graph tools are un-gated. This is a tracked follow-up."
)


class CombinedResolver:
    """Route per-user backings to the hosted or BYOS resolver by recorded mode.

    Stateless apart from the injected resolvers and preference store: every call
    reads the preference fresh, so a mode switch or erase takes effect on the
    very next call.
    """

    def __init__(
        self,
        *,
        preferences: StoragePreferenceStore,
        hosted: HostedTursoResolver,
        byos: ByosResolver,
    ) -> None:
        self._preferences = preferences
        self._hosted = hosted
        self._byos = byos

    def storage_mode(self, user: UserKey) -> StorageMode:
        preference = self._preferences.get(user)
        if preference is None:
            return "none"
        if preference.mode == "hosted":
            return self._hosted.storage_mode(user)
        if preference.mode == "byos":
            return self._byos.storage_mode(user)
        return "none"

    def graph_store(self, user: UserKey) -> GraphStore:
        preference = self._preferences.get(user)
        if preference is not None and preference.mode == "hosted":
            return self._hosted.graph_store(user)
        if preference is not None and preference.mode == "byos":
            return self._byos.graph_store(user)
        # No active mode: callers MUST check storage_mode() first; this guards the
        # invariant the same way the per-mode resolvers do.
        raise LookupError(
            "no active storage mode for this user; call storage_mode() before graph_store()"
        )

    def session_store(self, user: UserKey) -> SessionStore:
        raise NotImplementedError(_SESSION_PROFILE_DEFERRED)

    def profile_store(self, user: UserKey) -> ProfileStore:
        raise NotImplementedError(_SESSION_PROFILE_DEFERRED)
