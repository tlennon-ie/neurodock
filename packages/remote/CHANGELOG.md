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
