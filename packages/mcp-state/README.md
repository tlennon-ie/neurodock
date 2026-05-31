# `neurodock-state`

Per-user **state foundation** for the NeuroDock substrate (ADR 0010 Phase B).

This package holds the abstractions that let the stateful tools — cognitive
graph, chronometric session state, and the profile — be backed by a **per-user**
store, keyed by the authenticated user's identity, **without changing the tool
logic**. It is the seam ADR 0010 Phase C (hosted per-user storage) and Phase D
(bring-your-own-storage) plug into.

It defines, deliberately, only _contracts_ plus _in-memory reference
implementations_:

- `identity.py` — `UserKey` (a hashed, opaque per-user key derived from the
  Clerk token `sub`) and `user_key_from_context()`, which reads the validated
  FastMCP access token. Returns `None` when unauthenticated.
- `session_store.py` — the `SessionStore` protocol (open/close/current/touch a
  session, keyed by `UserKey`) plus `InMemorySessionStore`.
- `profile_store.py` — the `ProfileStore` protocol (get/put a profile dict) plus
  `InMemoryProfileStore`.
- `registry.py` — the `StateBackingResolver` protocol (resolve a graph store,
  session store, profile store, and storage mode for a `UserKey`) plus
  `MemoryBackingResolver`, which hands each distinct user its own isolated set of
  in-memory backings.

## Scope (Phase B only)

This package is **wiring-free**. Nothing here is connected to the chronometric
or cognitive-graph servers yet, and there is **no external infrastructure**
(no libSQL/Turso, no Durable Objects). The local stdio path is unchanged. Hosted
and BYOS backings (Phases C/D) land later behind the same contracts.

## Privacy

The raw token subject is **never** used as a storage key. `UserKey.storage_key`
returns the SHA-256 hex digest of the subject, so a leaked key reveals nothing
about the underlying identity. This mirrors ADR 0010's commitment that hosted
state is per-user isolated and never aggregated.
