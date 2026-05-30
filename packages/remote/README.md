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

### What is deliberately NOT here

The cognitive graph (personal facts), chronometric session state, the user
profile (neurotype data), and task-fractionator's `next_one` (reads the local
graph) are **never** mounted. They read or hold local state and stay strictly on
the local stdio install. The boundary is enforced in code and pinned by tests
against `REMOTE_TOOL_NAMES`.

> This is a **deploy artifact**, not a published package — it is not uploaded to
> PyPI (the local install path via `@neurodock/cli` is unchanged). Local-only
> tools remain available exactly as before through the stdio servers.

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
