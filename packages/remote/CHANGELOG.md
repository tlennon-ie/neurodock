# Changelog

All notable changes to `neurodock-remote` are documented here. This is an internal
deploy artifact and is not published to PyPI; versions track the deployed image.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [unreleased]

### Added

- Initial combined remote MCP server (ADR 0008/0009, Phase 2). Composes the three
  stateless servers — translation (×4), guardrail (×3), and task-fractionator
  `decompose` — into one Streamable HTTP endpoint at `/mcp` via FastMCP `mount`,
  with a `/health` probe and an env-driven, vendor-pluggable OAuth resource-server
  auth scaffold (`none` | `workos` | `jwt`, default `none`).
- `Dockerfile` (single-stage, non-root, healthcheck) building only the stateless
  workspace subset.
- Tests pinning the exposed tool surface to exactly the eight remote-safe tools and
  asserting local-only tools (`next_one`, cognitive-graph, chronometric) never leak.
- Clerk OAuth wired as the selected provider (`NEURODOCK_AUTH_PROVIDER=clerk`, via
  FastMCP's `ClerkProvider` OAuth proxy), alongside the existing `workos` and `jwt`
  options.
- Cloudflare Containers deploy scaffold: `wrangler.jsonc`, a Worker shim
  (`worker/index.ts`) that fronts `mcp.neurodock.org` and proxies to the container,
  `package.json` + `tsconfig.json`, and a deploy runbook in the README. Verified by
  docs; first `wrangler deploy` is the validation step.

### Fixed

- Corrected the Worker `package.json` dependency versions to ones that exist on npm
  (`@cloudflare/containers ^0.3.5`, `wrangler ^4.95.0`,
  `@cloudflare/workers-types ^4.20260531.1`); the initial pins were invalid and broke
  `npm install`. Lockfile committed.
- Rewrote `worker/index.ts` to Cloudflare's documented Container pattern — global
  `Cloudflare.Env` bindings plus the `cloudflare:workers` `env` import, no custom
  Durable Object constructor — so it type-checks against `@cloudflare/containers`
  0.3.5 (`tsc --noEmit` clean) and deploys.
- Moved the Docker ignore to the repo-root `.dockerignore` so it actually applies to
  the Cloudflare build (the build context is the repo root, where Docker reads it),
  shrinking the build context.

### Validated

- First real `wrangler deploy` succeeded: image built + pushed to the Cloudflare
  registry, container application created, and the Worker bound to the
  `mcp.neurodock.org` custom domain. Confirmed `ClerkProvider` requires the client
  secret at boot (set via `wrangler secret put NEURODOCK_CLERK_CLIENT_SECRET`).
