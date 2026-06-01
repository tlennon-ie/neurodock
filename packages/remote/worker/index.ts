// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 NeuroDock contributors.
//
// Cloudflare Containers Worker shim for the NeuroDock remote MCP server.
//
// Cloudflare Containers require a Worker as the public front: this Worker owns the
// `mcp.neurodock.org` custom domain and forwards every request to the Python
// FastMCP container (../Dockerfile) on its port 8000. The container itself serves
// `/mcp`, `/health`, and the OAuth/RFC-9728 routes; this shim is a pass-through and
// holds no application logic.
//
// The stateless tool surface means one shared backend instance is sufficient.
// Scale later with getRandom()/per-session ids if traffic warrants it.

import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

// The Worker's bindings + vars/secrets (mirrors wrangler.jsonc). Declared on the
// global `Cloudflare.Env` so the container binding and the `cloudflare:workers`
// `env` import are typed without a generated worker-configuration.d.ts.
declare global {
  namespace Cloudflare {
    interface Env {
      NEURODOCK_REMOTE: DurableObjectNamespace<NeurodockRemoteContainer>;
      // Non-secret config (wrangler `vars`).
      NEURODOCK_AUTH_PROVIDER: string;
      NEURODOCK_PUBLIC_URL: string;
      NEURODOCK_CLERK_DOMAIN: string;
      NEURODOCK_CLERK_CLIENT_ID: string;
      // Secrets (wrangler `secret put`); optional at the type level.
      NEURODOCK_CLERK_CLIENT_SECRET?: string;
      // ADR 0010 Phase D — opt-in BYOS storage. The Clerk Backend API key
      // (persists the per-user connection in Clerk private_metadata) and the
      // master key that encrypts the BYOS/hosted auth token at rest. Without both,
      // the opt-in tools are visible but return the sign-in/enable refusal.
      NEURODOCK_CLERK_SECRET_KEY?: string;
      NEURODOCK_STATE_MASTER_KEY?: string;
      // ADR 0010 Phase C — opt-in NeuroDock-hosted storage. The Turso Platform
      // API token + organization slug let NeuroDock provision a private Turso
      // database per user; the group is where those databases are created.
      // Without the token + org, enable_hosted_storage is refused (BYOS still works).
      NEURODOCK_TURSO_PLATFORM_TOKEN?: string;
      NEURODOCK_TURSO_ORG?: string;
      NEURODOCK_TURSO_GROUP?: string;
    }
  }
}

export class NeurodockRemoteContainer extends Container {
  // The FastMCP combined server listens on 8000 inside the container.
  defaultPort = 8000;
  // Sleep the instance after 15 minutes of inactivity, then cold-start on demand.
  sleepAfter = "15m";

  // Forward Worker vars/secrets into the container's process environment so
  // auth.py can pick up the Clerk OAuth configuration. Read from the
  // `cloudflare:workers` global `env` (class fields cannot see the fetch env).
  envVars = {
    NEURODOCK_AUTH_PROVIDER: env.NEURODOCK_AUTH_PROVIDER,
    NEURODOCK_PUBLIC_URL: env.NEURODOCK_PUBLIC_URL,
    NEURODOCK_CLERK_DOMAIN: env.NEURODOCK_CLERK_DOMAIN,
    NEURODOCK_CLERK_CLIENT_ID: env.NEURODOCK_CLERK_CLIENT_ID,
    NEURODOCK_CLERK_CLIENT_SECRET: env.NEURODOCK_CLERK_CLIENT_SECRET ?? "",
    // ADR 0010 Phase D — BYOS storage secrets. Empty string when unset; the
    // server then leaves the opt-in tools un-backed (every call returns the
    // sign-in/enable refusal) rather than failing to boot.
    NEURODOCK_CLERK_SECRET_KEY: env.NEURODOCK_CLERK_SECRET_KEY ?? "",
    NEURODOCK_STATE_MASTER_KEY: env.NEURODOCK_STATE_MASTER_KEY ?? "",
    // ADR 0010 Phase C — NeuroDock-hosted storage. Empty string when unset; the
    // server then refuses enable_hosted_storage (BYOS is unaffected) rather than
    // failing to boot. NEURODOCK_TURSO_GROUP defaults to "default" in the app.
    NEURODOCK_TURSO_PLATFORM_TOKEN: env.NEURODOCK_TURSO_PLATFORM_TOKEN ?? "",
    NEURODOCK_TURSO_ORG: env.NEURODOCK_TURSO_ORG ?? "",
    NEURODOCK_TURSO_GROUP: env.NEURODOCK_TURSO_GROUP ?? "",
    // The container binds all interfaces; the Worker is the only ingress.
    NEURODOCK_HTTP_HOST: "0.0.0.0",
    NEURODOCK_HTTP_PORT: "8000",
  };
}

export default {
  async fetch(request: Request, env: Cloudflare.Env): Promise<Response> {
    const container = getContainer(env.NEURODOCK_REMOTE, "neurodock-remote");
    return container.fetch(request);
  },
} satisfies ExportedHandler<Cloudflare.Env>;
