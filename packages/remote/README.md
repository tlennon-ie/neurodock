# neurodock-remote

The **combined remote MCP server** for NeuroDock (ADR 0008 / ADR 0009, Phase 2).

It composes the three **stateless** NeuroDock servers into a single
[Streamable HTTP](https://modelcontextprotocol.io/) endpoint and exposes **only**
the remote-safe tools:

| Source server           | Tools exposed remotely                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `mcp-translation`       | `translate_incoming`, `check_tone`, `rewrite_outgoing`, `brief_meeting` |
| `mcp-guardrail`         | `check_rumination`, `check_hyperfocus`, `check_sycophancy`              |
| `mcp-task-fractionator` | `decompose` only                                                        |

### Opt-in storage surface (ADR 0010 Phases C/D)

The four cognitive-graph tools (`recall_entity`, `record_fact`,
`recall_decisions`, `weekly_rollup`) are also exposed, but **gated**: they require
a signed-in account that has **explicitly enabled** storage. Two modes coexist; a
user is in exactly one at a time:

| Tool                        | Mode   | What it does                                                                                                                                    |
| --------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `enable_hosted_storage`     | hosted | NeuroDock provisions a **private per-user Turso database** and stores facts there. Returns the consent disclosure.                              |
| `connect_byos_storage`      | byos   | You point at your **own** libSQL/Turso database; NeuroDock stores only the connection pointer.                                                  |
| `disable_and_erase_storage` | → none | Hosted: **destroys** your Turso database. BYOS: clears the stored connection (your DB untouched). Either way the preference/consent is cleared. |
| `disconnect_storage`        | → none | BYOS-only alias: clears the connection + preference. (Use `disable_and_erase_storage` to erase hosted.)                                         |
| `storage_status`            | —      | Reports your mode (`hosted` \| `byos` \| `none`).                                                                                               |

The mode is selected per user from their recorded **storage preference**; a
single combined resolver routes each cognitive-graph call to the hosted or BYOS
backing. The privacy boundary is unchanged from Phase D: an anonymous / no-token
caller gets `STORAGE_NOT_AVAILABLE` and **nothing is stored, read, or
provisioned**; a signed-in but not-enabled caller gets `STORAGE_NOT_CONNECTED`.

> **Hosted requires a provisioned Turso org/group/token.** Set
> `NEURODOCK_TURSO_PLATFORM_TOKEN` + `NEURODOCK_TURSO_ORG` (+ optional
> `NEURODOCK_TURSO_GROUP`, default `default`, which must already exist in the
> org). Without them `enable_hosted_storage` is refused and only BYOS is offered.

> **Encryption-key custody (honest limitation).** Both the BYOS auth token and the
> hosted Turso DB token are encrypted at rest with a single operator-wide
> `NEURODOCK_STATE_MASTER_KEY`. That means NeuroDock can _technically_ decrypt a
> stored token. This is the documented ADR 0010 open question; per-user / envelope
> keys (so the operator cannot unilaterally read a user's DB token) are a tracked
> follow-up. The on-disk format is unchanged either way, so a future scheme can
> re-wrap without a data migration.

### What is deliberately NOT here

Chronometric session state, the user profile (neurotype data), and
task-fractionator's `next_one` (reads the local graph) are **never** mounted. They
hold local state and stay strictly on the local stdio install. The boundary is
enforced in code and pinned by tests against `REMOTE_TOOL_NAMES`.

> This is a **deploy artifact**, not a published package — it is not uploaded to
> PyPI (the local install path via `@neurodock/cli` is unchanged). Local-only
> tools remain available exactly as before through the stdio servers.

### Skills delivery (hosted/remote users)

The remote server exposes **tools**, not skills. Skills are markdown the
client reads locally, so the remote endpoint never delivers them. Hosted/remote
users get the per-neurotype skills the same way local users do: install the
**Claude Code marketplace plugin** (which bundles them) or run
`neurodock install-skills` from `@neurodock/cli`, which copies each skill into
`~/.claude/skills/neurodock-<name>/SKILL.md` for Claude Code / Claude Desktop.
See [packages/skills/README.md](../skills/README.md) for the delivery paths.

## Run locally

```bash
# from the repo root
uv run --package neurodock-remote neurodock-remote
# serves http://127.0.0.1:8000/mcp  (+ /health)
```

Inspect it with the MCP Inspector pointed at `http://127.0.0.1:8000/mcp`.

## Configuration

| Env var                                              | Default     | Purpose                                                                                 |
| ---------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------- |
| `NEURODOCK_HTTP_HOST`                                | `127.0.0.1` | Bind host (`0.0.0.0` in the container).                                                 |
| `NEURODOCK_HTTP_PORT`                                | `8000`      | Bind port.                                                                              |
| `NEURODOCK_AUTH_PROVIDER`                            | `none`      | `none` \| `clerk` \| `workos` \| `jwt`. The hosted deploy uses `clerk`.                 |
| `NEURODOCK_PUBLIC_URL`                               | —           | Public base URL, e.g. `https://mcp.neurodock.org` (required by `clerk`/`workos`/`jwt`). |
| `NEURODOCK_OAUTH_REQUIRED_SCOPES`                    | —           | Optional, comma-separated.                                                              |
| `NEURODOCK_CLERK_DOMAIN`                             | —           | `clerk`: your Clerk instance domain (e.g. `your-app.clerk.accounts.dev`).               |
| `NEURODOCK_CLERK_CLIENT_ID`                          | —           | `clerk`: OAuth application client ID.                                                   |
| `NEURODOCK_CLERK_CLIENT_SECRET`                      | —           | `clerk`: OAuth client secret (set as a secret, not plaintext).                          |
| `NEURODOCK_CLERK_SECRET_KEY`                         | —           | Storage (ADR 0010 C/D): Clerk Backend API key; persists the per-user storage pointer.   |
| `NEURODOCK_STATE_MASTER_KEY`                         | —           | Storage (ADR 0010 C/D): master key that encrypts the BYOS/hosted DB token at rest.      |
| `NEURODOCK_TURSO_PLATFORM_TOKEN`                     | —           | Hosted (ADR 0010 C): Turso Platform API token; provisions/destroys per-user databases.  |
| `NEURODOCK_TURSO_ORG`                                | —           | Hosted (ADR 0010 C): Turso organization slug the hosted databases are created in.       |
| `NEURODOCK_TURSO_GROUP`                              | `default`   | Hosted (ADR 0010 C): Turso group the hosted databases are created in (must exist).      |
| `NEURODOCK_GRAPH_DISABLE_EMBEDDINGS`                 | `1` (image) | Storage: keeps the hosted graph lean (no fastembed). Set in the Dockerfile.             |
| `NEURODOCK_AUTHKIT_DOMAIN`                           | —           | `workos`: your AuthKit domain.                                                          |
| `NEURODOCK_OAUTH_ISSUER` / `_JWKS_URI` / `_AUDIENCE` | —           | `jwt`: generic OIDC resource-server config.                                             |

> ⚠️ **Auth is required before public exposure.** With `NEURODOCK_AUTH_PROVIDER`
> unset the server runs **unauthenticated** and logs a loud warning — that mode is
> for localhost/integration testing only (ADR 0009 §3). The identity provider is a
> configuration choice, not a code change; FastMCP ships first-class Clerk, WorkOS
> AuthKit, and Auth0 providers plus the generic JWT verifier wired here.

## Container (any host)

```bash
# build from the repo root (the Dockerfile uses root-relative COPY paths)
docker build -f packages/remote/Dockerfile -t neurodock-remote .
docker run --rm -p 8000:8000 \
  -e NEURODOCK_AUTH_PROVIDER=clerk \
  -e NEURODOCK_CLERK_DOMAIN=your-app.clerk.accounts.dev \
  -e NEURODOCK_CLERK_CLIENT_ID=xxxx \
  -e NEURODOCK_CLERK_CLIENT_SECRET=yyyy \
  -e NEURODOCK_PUBLIC_URL=https://mcp.neurodock.org \
  neurodock-remote
```

## Deploy to Cloudflare Containers

The chosen host (ADR 0009). The Python container runs on Cloudflare Containers,
fronted by a thin Worker ([worker/index.ts](worker/index.ts)) that owns the
`mcp.neurodock.org` custom domain. Config: [wrangler.jsonc](wrangler.jsonc).

> **Requires a Workers _Paid_ plan** — Containers are not on the free tier.
> The Worker + container are deploy tooling only; this directory is intentionally
> **not** a pnpm-workspace member, so install/deploy happen here directly.

1. **Create a Clerk OAuth application** and note the instance domain + client ID/secret.
2. Fill `vars` in [wrangler.jsonc](wrangler.jsonc) (`NEURODOCK_CLERK_DOMAIN`,
   `NEURODOCK_CLERK_CLIENT_ID`) — these are non-secret.
3. From this directory (`packages/remote/`):

   ```bash
   npm install
   npx wrangler secret put NEURODOCK_CLERK_CLIENT_SECRET   # paste the secret
   # Optional — enable the opt-in memory tools (ADR 0010 C/D). Without the next
   # two the tools stay visible but un-backed (sign-in/enable refusal):
   npx wrangler secret put NEURODOCK_CLERK_SECRET_KEY      # Clerk Backend API key
   npx wrangler secret put NEURODOCK_STATE_MASTER_KEY      # token-encryption master key
   # Optional — enable NeuroDock-hosted storage (ADR 0010 C). Also set
   # NEURODOCK_TURSO_ORG (and NEURODOCK_TURSO_GROUP) in wrangler.jsonc `vars`.
   # Without the token + org, enable_hosted_storage is refused; BYOS still works:
   npx wrangler secret put NEURODOCK_TURSO_PLATFORM_TOKEN  # Turso Platform API token
   npx wrangler deploy                                     # builds ../Dockerfile, pushes, deploys
   ```

   `wrangler deploy` builds the image (context `../../` = repo root), provisions
   the `mcp.neurodock.org` DNS + TLS automatically (the `custom_domain` route), and
   starts the container behind the Worker.

4. Verify: `https://mcp.neurodock.org/health` → `200`, then add
   `https://mcp.neurodock.org/mcp` as a custom connector in Claude and complete the
   Clerk OAuth round-trip.

See [ADR 0009](../../docs/decisions/0009-remote-transport-and-hosting.md) for the
transport, scope, auth, and hosting decisions.

> **Status:** this Cloudflare deploy config is a verified-by-docs scaffold; it has
> not yet been run through `wrangler deploy`. Treat the first deploy as the
> validation step.
