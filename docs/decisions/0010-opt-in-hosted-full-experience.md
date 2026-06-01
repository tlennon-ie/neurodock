# 0010 — Opt-in hosted full experience: stateful tools (hosted + BYOS) and skill prompts

- **Status:** proposed — direction agreed 2026-05-31; requires clinical/governance sign-off before the stateful phases ship (ETHICS.md is a data-handling change).
- **Date:** 2026-05-31
- **Deciders:** maintainer, `mcp-architect`
- **Consulted:** `mcp-cognitive-graph-expert`, `mcp-chronometric-expert`, `clinical-expert`, `governance-author` (privacy / GDPR / ETHICS), `native-host-expert`
- **Informed:** `release-pilot`, `doc-writer`, `cli-expert`

## Context

ADR 0008/0009 deliberately limited the hosted remote server (`mcp.neurodock.org`)
to the **stateless** tool surface (translation, guardrail, `decompose`). The
stateful tools — cognitive graph, chronometric session state, the profile, and
`next_one` — were kept local-only because they read or hold the user's personal
and neurotype data, which under NeuroDock's founding commitment **never leaves the
device** (ETHICS.md principle: "We never track silently… every signal stays on the
user's machine").

The hosted connector is now live and working. There is demand for the **full** tool
suite **without a local install**, while keeping **privacy as the user's explicit
choice**. This ADR records the decision to offer that as a strictly **opt-in**
capability, and the two-mode storage architecture behind it.

It also records a smaller, immediately-shippable decision: exposing the stateless
ND skills as **MCP prompts** on the hosted server.

## Decision

### 1. Skill prompts on the hosted server (Phase A — additive, no personal data)

Expose the stateless ND skills (`translate-incoming`, `decompose-task`,
`check-rumination`, and the tone/rewrite/brief variants) as **MCP prompts** on the
hosted endpoint. MCP carries tools/resources/**prompts**, not Claude-Code skills, so
prompts are the remote-native equivalent. No personal data, no storage, no auth
change — it works for every connected client immediately.

### 2. Opt-in stateful tools, with TWO user-selectable storage modes

The full stateful tools become available on the hosted server **only** when the
authenticated user explicitly opts in. The user chooses where their state lives:

- **(a) Hosted per-user storage** — easiest UX. Each user's cognitive graph,
  chronometric state, and profile live server-side, **isolated per Clerk identity**
  (the verified token `sub`). One **Durable Object per user** (SQLite-backed) gives
  natural per-tenant isolation and persistence; the container already uses DOs.
  Encrypted at rest. Zero setup for the user.
- **(b) Bring-your-own-storage (BYOS)** — maximum privacy. The user supplies their
  own libSQL/Turso-compatible connection; the hosted server persists **nothing**
  locally. Data stays fully theirs. Costs one setup step (provide a URL/token).

Both sit behind a single **`StateStore` protocol** so the tool logic is unchanged;
only the backing store differs (`HostedDurableObjectStore` vs `ByosLibsqlStore`),
selected per-user from their opt-in configuration.

### 3. Identity and isolation

Per-user state is keyed by the **Clerk token `sub`**, extracted from the validated
access token. Cross-tenant access is impossible by construction (DO-per-user / a
per-user connection). `next_one` and the graph never see another user's data.

### 4. Privacy, ethics, and the default

- **Default unchanged:** anonymous and non-opted-in sessions get only the stateless
  surface (ADR 0008/0009 boundary holds). Nothing is stored for them.
- **Opt-in is explicit and informed:** a consent step discloses exactly what is
  stored, where, and how to delete it. Privacy is the user's choice — hosted
  (convenience) or BYOS (full ownership) or neither (local install).
- **ETHICS.md is amended,** not broken: "nothing leaves your device" becomes
  "nothing leaves your device **by default**; hosted state is **opt-in, per-user
  isolated, encrypted, user-deletable, and never aggregated**." Principle 4 (no
  population-level aggregation) is preserved absolutely.
- **GDPR:** neurotype data is **special-category**. Hosted storage requires explicit
  consent, a retention/erasure path (delete = drop the user's DO/rows; BYOS = simply
  disconnect), a data-processing statement, and an EU-residency decision.
- **The local-first path stays primary.** The one-click `.mcpb` already delivers the
  full suite + skills locally with data on-device; hosted state is for users who want
  zero on-device footprint.

## Consequences

**Positive:** the full NeuroDock experience becomes available with no local install,
and the privacy/convenience trade-off is genuinely the user's to make.

**Costs / risks:** multi-tenant storage + isolation complexity; encryption-at-rest
and key management; a privacy-policy rewrite and ETHICS.md amendment; clinical +
governance sign-off (this is the first time NeuroDock would hold user data); ongoing
storage cost. These gate the stateful phases — **Phase A (prompts) ships
independently and now**.

## Implementation phases

- **A. Skill prompts** — register stateless skills as MCP prompts on the combined
  server. No storage, no auth change. _Ships now._
- **B. `StateStore` protocol** — abstract the cognitive-graph/chronometric/profile
  persistence behind a per-user store interface, keyed by Clerk `sub`. No behaviour
  change locally (the local stdio path keeps its on-disk SQLite store).
- **C. Hosted per-user storage** — _shipped_ as a **NeuroDock-provisioned Turso
  database per user** rather than the originally-sketched DO-per-user store: the
  hosted server provisions one Turso database per Clerk identity via the Turso
  Platform API (`HostedTursoResolver` + `turso_platform` client), records explicit
  consent, and resolves the same `LibSqlStorage` the BYOS path uses — so the two
  modes share one backing class and one combined resolver. The Turso choice keeps
  hosted and BYOS byte-for-byte identical at the SQL level and avoids a second
  storage engine. The DB auth token is encrypted at rest with the operator master
  key. `enable_hosted_storage` provisions (idempotent) + consents;
  `disable_and_erase_storage` destroys the database + clears the preference.
  **Open limitation:** a single operator-wide `NEURODOCK_STATE_MASTER_KEY` means
  NeuroDock can technically decrypt a stored Turso token — see "Open questions"
  (encryption key custody); per-user / envelope keys are a tracked follow-up.
- **D. BYOS adapter** — `ByosLibsqlStore`; per-user connection config (supplied via a
  connect step / Clerk private_metadata) handled as a secret.
- **E. Governance + docs** — privacy-policy rewrite, ETHICS.md amendment, clinical
  sign-off, consent UX, Connectors-Directory data-handling disclosure.

## Open questions

Encryption key custody for hosted storage; EU data residency; how BYOS credentials
are supplied and stored; whether hosted storage is metered/paid; whether `next_one`
(graph-dependent) is exposed only in hosted/BYOS modes or stays stdio-only even then.
