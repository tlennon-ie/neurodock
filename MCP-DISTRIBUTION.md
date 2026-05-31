# MCP distribution and discovery kit

This document is the submission kit for getting the hosted NeuroDock MCP
server into the public discovery channels. It is a reference for the
maintainer, not a published docs page. Each section gives the exact action
for one channel: the fields to fill, the entry to add, or the fact that no
action is needed because the channel auto-indexes.

It covers only the **hosted remote** server. The five local stdio servers and
the `neurodock-remote` entry are already published to the official MCP Registry
(`registry.modelcontextprotocol.io`) under the `io.github.tlennon-ie/*`
namespace, so the registry itself needs no further submission here. The
distribution strategy and the local-vs-remote boundary are recorded in
[ADR 0008](./docs/decisions/0008-distribution-and-remote-strategy.md) and
[ADR 0009](./docs/decisions/0009-remote-transport-and-hosting.md). This kit is
the Phase 3 follow-through from ADR 0008.

## Canonical facts (single source for every form below)

| Field                       | Value                                                                  |
| --------------------------- | ---------------------------------------------------------------------- |
| Connector / server name     | NeuroDock                                                              |
| Registry name (remote)      | `io.github.tlennon-ie/neurodock-remote`                                |
| MCP endpoint                | `https://mcp.neurodock.org/mcp`                                        |
| Transport                   | Streamable HTTP                                                        |
| Auth                        | OAuth 2.1 (PKCE, S256) via Clerk; RFC 9728 protected-resource metadata |
| Protected-resource metadata | `https://mcp.neurodock.org/.well-known/oauth-protected-resource/mcp`   |
| Website                     | `https://neurodock.org/`                                               |
| Documentation               | `https://docs.neurodock.org/`                                          |
| Privacy policy              | `https://neurodock.org/legal/privacy/`                                 |
| Repository                  | `https://github.com/tlennon-ie/neurodock`                              |
| License                     | AGPL-3.0-or-later                                                      |
| Support (general)           | `https://github.com/tlennon-ie/neurodock/issues`                       |
| Support (security)          | `security@neurodock.org`                                               |
| Logo (square, raster)       | `docs/public/icon/512.png`                                             |
| Logo (vector / favicon)     | `docs/public/favicon.svg`                                              |
| Social card                 | `docs/public/og-image.svg`                                             |

### The hosted tool surface (8 tools, all stateless)

The remote endpoint exposes only the stateless tools. The cognitive graph,
chronometric session state, the profile, and task-fractionator's `next_one`
stay local and are never exposed over the network (the boundary is enforced in
code and pinned by tests; see ADR 0009).

| Source server           | Tools                                                                   | Annotation |
| ----------------------- | ----------------------------------------------------------------------- | ---------- |
| `mcp-translation`       | `translate_incoming`, `check_tone`, `rewrite_outgoing`, `brief_meeting` | read-only  |
| `mcp-guardrail`         | `check_rumination`, `check_hyperfocus`, `check_sycophancy`              | read-only  |
| `mcp-task-fractionator` | `decompose`                                                             | read-only  |

All eight are advisory and read-only: they analyse the text you pass in and
return structured analysis. None write to a store, send anything, or mutate
external state, so each carries `readOnlyHint: true` and none carries
`destructiveHint`. Confirm the `title` and `readOnlyHint` annotations are
present on every tool before submitting to the Connectors Directory (a missing
annotation is the single most common rejection cause).

### Short and long descriptions (reuse verbatim)

**Tagline (one line):**

> A cognitive substrate that remembers, paces, and refuses. Built with neurodivergent professionals, not for them.

**Short description (around 160 characters):**

> Local-first cognitive substrate for neurodivergent professionals. The hosted server adds stateless communication, planning, and guardrail tools over OAuth.

**Long description:**

> NeuroDock gives an MCP-aware AI client a translator for corporate ambiguity, a
> planner that breaks vague goals into startable steps, and a guardrail that
> declines to amplify rumination, hyperfocus, or sycophancy. The hosted server at
> `mcp.neurodock.org/mcp` exposes only the stateless tools (translation,
> guardrail, and task decomposition) over OAuth-secured Streamable HTTP. The
> sensitive local state (a personal-memory graph and a neurotype profile) is never
> hosted; it stays on your device through the local install. Built with
> neurodivergent professionals, not for them. Self-identification is sufficient;
> we never ask for a diagnosis. No telemetry. AGPL-3.0-or-later.

<!-- nd-copy-allow: "diagnosis" is the project's own anti-gatekeeping line, matching README and branding.md voice; not pathologising copy. -->

**Categories / tags:** Productivity, Communication, Knowledge and Memory, Accessibility, Translation.

---

## 1. Anthropic Connectors Directory

A manual form submission. Review takes roughly two weeks; the form stays open.
NeuroDock is a remote MCP server (not an MCP App), so use the remote-MCP form.

**Form:** MCP directory submission form at `https://clau.de/mcp-directory-submission`
(linked from the official guide at
`https://claude.com/docs/connectors/building/submission`).

Fill the form with these values:

| Form field                  | Value                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server name                 | NeuroDock                                                                                                                                                                                       |
| Server URL (MCP endpoint)   | `https://mcp.neurodock.org/mcp`                                                                                                                                                                 |
| Tagline                     | A cognitive substrate that remembers, paces, and refuses.                                                                                                                                       |
| Description                 | Long description above.                                                                                                                                                                         |
| Use cases                   | Decoding ambiguous work messages; tone-checking a draft before sending; breaking a vague goal into startable steps; an advisory guardrail against rumination, hyperfocus, and sycophancy loops. |
| Transport protocol          | Streamable HTTP                                                                                                                                                                                 |
| Authentication type         | OAuth 2.1 (PKCE, S256) via Clerk; RFC 9728 protected-resource metadata at `/.well-known/oauth-protected-resource/mcp`                                                                           |
| Read / write capabilities   | Read-only. All eight tools are advisory and carry `readOnlyHint: true`.                                                                                                                         |
| Tools / resources / prompts | The eight tools listed above (human-readable titles plus annotations). No resources. Prompts guide the model to the matching tool.                                                              |
| Data handling               | Tool inputs are processed in memory to produce the analysis and are not persisted server-side. No third-party data sharing. No health data. Sensitive local state is never hosted.              |
| Category                    | Productivity (secondary: Communication, Accessibility)                                                                                                                                          |
| Documentation link          | `https://docs.neurodock.org/`                                                                                                                                                                   |
| Privacy policy URL          | `https://neurodock.org/legal/privacy/`                                                                                                                                                          |
| Support channel             | `https://github.com/tlennon-ie/neurodock/issues`                                                                                                                                                |
| Server logo                 | Upload `docs/public/favicon.svg`, or link the raster `docs/public/icon/512.png`.                                                                                                                |
| Test account / credentials  | Provide a Clerk test account with setup steps, or note that any account can complete the OAuth flow against the hosted endpoint.                                                                |
| Tested surfaces             | Confirm the connector has been added and exercised on Claude.ai and Claude Desktop.                                                                                                             |

**Pre-submission checklist (the four common rejection causes):**

- [ ] Every tool has a `title` and a `readOnlyHint: true` annotation.
- [ ] Privacy policy is live at `https://neurodock.org/legal/privacy/` and complete.
- [ ] OAuth allowlists both `https://claude.ai/api/mcp/auth_callback` and `https://claude.com/api/mcp/auth_callback` as redirect URIs in Clerk.
- [ ] Documentation at `https://docs.neurodock.org/` is public by the submission date.

---

## 2. awesome-mcp-servers (punkpeye/awesome-mcp-servers)

A PR to an external repository. The list orders entries alphabetically within
each category and uses a one-line format: repository link, then language and
scope emoji, then a short description. The Glama score badge is optional and
many entries omit it, so a plain line is acceptable.

**Category:** NeuroDock spans Communication, Knowledge and Memory, and
Translation. The hosted surface is communication-led (translation plus
guardrail plus decomposition), so add it under **Communication**
(`### 💬 <a name="communication"></a>Communication`). The legend emoji used
below are 🐍 (Python codebase), 🏠 (local service, the default install), and
☁️ (cloud service, the hosted endpoint).

**Exact line to add** (place it in alphabetical order within the section):

```markdown
- [tlennon-ie/neurodock](https://github.com/tlennon-ie/neurodock) 🐍 🏠 ☁️ - Local-first cognitive substrate for neurodivergent professionals: a translator for corporate ambiguity, a planner, and a guardrail that declines to amplify rumination, hyperfocus, or sycophancy. Hosted stateless tools over OAuth.
```

**Steps to open the PR:**

1. Fork `https://github.com/punkpeye/awesome-mcp-servers`.
2. Create a branch, for example `add-neurodock`.
3. Edit `README.md`. Find the Communication section and insert the line above in alphabetical position.
4. Keep the formatting identical to the surrounding lines (one entry per line, link first, emoji next, description last).
5. Commit, push, and open a PR against `punkpeye/awesome-mcp-servers:main`.
6. In the PR description, state the category and confirm the link resolves and the description is accurate.

(The list fast-tracks PRs from automated agents that append `🤖🤖🤖` to the PR
title. This is a human-reviewed submission, so do not use that marker.)

---

## 3. Secondary directories (Smithery, Glama, PulseMCP, mcp.so)

Publishing to the official MCP Registry (already done for
`io.github.tlennon-ie/neurodock-remote`) is what feeds most of these. They
ingest or discover registry and GitHub metadata, so several need no manual
action. The table records whether each auto-indexes or needs a submission, and
the exact action where one is needed.

| Channel  | Indexing                                                                    | Action                                                                                                                                            |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Smithery | Lists servers; can connect a remote endpoint hosted elsewhere.              | Optional manual add. See the Smithery note below. No `smithery.yaml` is needed (that file is only for servers Smithery itself builds and hosts).  |
| Glama    | Auto-indexes open-source servers from GitHub, and ingests the registry.     | Optional: confirm the listing appears, or add it explicitly at `https://glama.ai/mcp/servers` (the "Add Server" flow takes the GitHub repo URL).  |
| PulseMCP | Ingests the official registry; picks up new registry entries within a week. | Mostly automatic. To list sooner or add detail, use the form at `https://www.pulsemcp.com/submit`.                                                |
| mcp.so   | Community directory; ingests the registry and accepts submissions.          | Optional: submit via the "Submit" button on `https://mcp.so/` (opens a GitHub issue on `chatmcp/mcpso`) with the name, description, and endpoint. |

### Smithery note (no smithery.yaml)

Smithery requires a `smithery.yaml` only when Smithery builds and hosts the
server itself (its TypeScript or container runtime, served from
`server.smithery.ai`). The NeuroDock remote is hosted on its own
infrastructure at `https://mcp.neurodock.org/mcp` with its own OAuth, so the
Smithery-hosted runtime does not apply and **no `smithery.yaml` is added to
this repo**. If a Smithery listing is wanted, add the existing remote endpoint
through Smithery's add-server flow (which accepts an HTTPS URL or a GitHub
repo) rather than configuring a Smithery deployment.

### Submission copy for the secondary directories

Where a form or issue asks for fields, reuse the canonical facts table at the
top of this document: name `NeuroDock`, endpoint `https://mcp.neurodock.org/mcp`,
the short description, the repo and docs links, the privacy-policy URL, and the
categories (Productivity, Communication, Knowledge and Memory, Accessibility,
Translation).

---

## Order of operations

1. Confirm the four Connectors-Directory preconditions (annotations, privacy policy, OAuth redirect URIs, public docs).
2. Submit the Anthropic Connectors Directory form (section 1). This is the highest-value channel and the slowest to review.
3. Open the awesome-mcp-servers PR (section 2).
4. Confirm or add the secondary-directory listings (section 3). Most arrive on their own from the registry; add the rest only if a faster or richer listing is wanted.
