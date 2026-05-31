# 0009 — Remote transport and hosting for the stateless servers (Phase 2)

- **Status:** accepted — Phase 2 foundation implemented 2026-05-30; OAuth IdP selection, hosting, and the Connectors Directory submission remain pending.
- **Date:** 2026-05-30
- **Deciders:** maintainer (TBD), `mcp-architect`
- **Consulted:** `mcp-server-builder`, `mcp-translation-expert`, `mcp-guardrail-expert`, `mcp-task-fractionator-expert`, `governance-author` (privacy policy / AGPL)
- **Informed:** `release-pilot`, `doc-writer`, `cli-expert`

## Context

ADR 0008 committed to a phased rollout in which **only the stateless servers**
are ever exposed over a network: `mcp-translation` (4 tools), `mcp-guardrail`
(3 tools), and `mcp-task-fractionator`'s `decompose` tool. The cognitive graph,
chronometric session state, the profile, and task-fractionator's `next_one`
(which reads the graph) stay strictly local.

This ADR records the Phase 2 transport, scope, auth, and hosting decisions, and
the concrete first step taken now (the opt-in HTTP transport flag).

The servers use **FastMCP ≥ 3.3.0**, which ships Streamable HTTP and auth
providers built in, so enabling HTTP is a small entrypoint change, not a rewrite.
`neurodock.org` DNS is managed in Cloudflare (verified), and the `mcp.` subdomain
is unused — so wiring a host later is a single record.

## Decision

1. **Transport — opt-in HTTP, stdio stays default (implemented now).** Each
   stateless server's entrypoint selects transport from the environment:

   - default → **stdio** (today's behaviour, byte-for-byte unchanged);
   - `NEURODOCK_HTTP` truthy **or** `--http` flag → **Streamable HTTP**, bound to
     `NEURODOCK_HTTP_HOST` (default `127.0.0.1`) and `NEURODOCK_HTTP_PORT`
     (default `8000`).
     This is the scaffolding landed in this change; it adds a network _option_, not
     a running service. No client default changes.

2. **Scope — enforce the ADR 0008 boundary in code.** The HTTP build of
   `mcp-task-fractionator` exposes **only `decompose`**; `next_one` is registered
   in stdio mode only. translation and guardrail expose their full toolset in
   both modes (already stateless). cognitive-graph and chronometric get **no**
   HTTP transport.

3. **Auth — OAuth 2.1 + RFC 9728 via a managed IdP (deferred to the next
   sub-phase).** A public remote endpoint and the Connectors Directory require
   OAuth 2.1, Protected Resource Metadata at
   `/.well-known/oauth-protected-resource`, Dynamic Client Registration, and
   audience-bound tokens. We will use FastMCP's auth provider backed by a managed
   IdP (WorkOS AuthKit / Auth0 / Clerk / Stytch) rather than hand-rolling it.
   **Not** part of this scaffold — the bare HTTP flag binds to localhost and is
   for local/integration testing only until auth lands.

4. **Hosting — container host fronted by Cloudflare; _not_ Workers.** The servers
   are Python FastMCP; Python-on-Workers is too limited to run FastMCP cleanly,
   so Cloudflare Workers is rejected for hosting the existing servers. Chosen
   shape: deploy the combined stateless toolset as a container (Fly.io / Render /
   Cloudflare Containers) and point `mcp.neurodock.org` at it via a **proxied
   Cloudflare DNS record** (or a Cloudflare Tunnel). A from-scratch TypeScript
   Worker rewrite of the three stateless tools remains a possible alternative but
   duplicates logic and the eval corpus binding — deferred unless hosting cost
   forces it.

5. **Endpoint shape.** Lean toward a **single combined endpoint** at
   `https://mcp.neurodock.org/mcp` mounting translation + guardrail +
   `decompose`, rather than per-server subpaths. Final call when the host lands.

## Consequences

**Positive:** the HTTP option is available now for integration tests and a future
deploy, with zero change to the default stdio path; the remote boundary is
enforced in code, not just documented.

**Costs / deferred:** OAuth, the container deployment, the privacy-policy page on
neurodock.org, and the Connectors Directory submission are all still pending. A
hosted privacy policy is the top Directory rejection cause and must precede
submission.

**Open questions:** managed-IdP choice; container host; single-vs-multi endpoint;
whether to ever rewrite the stateless tools as a TS Worker.

## Implementation status (2026-05-30 — Phase 2 foundation)

The decision-independent foundation now exists as the **`packages/remote`**
workspace package (`neurodock-remote`, an internal deploy artifact — not published
to PyPI):

- **Combined server (decision 5 → single endpoint).** `app.py` composes the three
  stateless servers with FastMCP `mount` (no namespace → flat tool names) into one
  Streamable HTTP app at `/mcp`, plus a `/health` probe. The exposed surface is
  exactly the eight remote-safe tools; tests pin it against `REMOTE_TOOL_NAMES` and
  assert `next_one` / cognitive-graph / chronometric tools never leak (decision 2).
- **Auth scaffold (decision 3), vendor-pluggable and default-off.** `auth.py` reads
  `NEURODOCK_AUTH_PROVIDER` (`none` | `workos` | `jwt`) and builds the matching
  FastMCP provider — WorkOS `AuthKitProvider` (purpose-built for MCP DCR + RFC 9728)
  or a generic `RemoteAuthProvider`/`JWTVerifier` for any OIDC issuer. The IdP is
  therefore a configuration choice, not a code change. Default `none` returns no
  auth and logs a loud warning that the endpoint must not be exposed publicly.
- **Container (decision 4).** `Dockerfile` builds only the stateless workspace
  subset, runs non-root with a healthcheck, and binds `0.0.0.0` explicitly (the
  app code still defaults to `127.0.0.1`).
- **Privacy policy.** Published at `/legal/privacy/` on the docs site — the top
  Connectors-Directory rejection cause, removed in advance.

Verified locally: 10 tests green under the repo-root pytest config, `ruff` clean,
`mypy --strict` clean, and a served-app smoke test (`/health` → 200, `/mcp` → 406
for a bare GET, i.e. the route is live).

**Still gated on a human decision / action:** (a) pick the managed IdP and stand up
its tenant; (b) pick the container host and deploy the image; (c) add a proxied
`mcp.neurodock.org` DNS record once the host exists; (d) submit to the Anthropic
Connectors Directory. None of these change the foundation above.
