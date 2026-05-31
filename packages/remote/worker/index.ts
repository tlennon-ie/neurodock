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

interface Env {
  NEURODOCK_REMOTE: DurableObjectNamespace<NeurodockRemoteContainer>;
  // Non-secret config (wrangler `vars`) + the secret (wrangler `secret put`),
  // forwarded into the container's environment below.
  NEURODOCK_AUTH_PROVIDER: string;
  NEURODOCK_PUBLIC_URL: string;
  NEURODOCK_CLERK_DOMAIN: string;
  NEURODOCK_CLERK_CLIENT_ID: string;
  NEURODOCK_CLERK_CLIENT_SECRET?: string;
}

export class NeurodockRemoteContainer extends Container<Env> {
  // The FastMCP combined server listens on 8000 inside the container.
  defaultPort = 8000;
  // Sleep the instance after 15 minutes of inactivity, then cold-start on demand.
  sleepAfter = "15m";

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Forward Worker vars/secrets into the container's process environment so
    // auth.py can pick up the Clerk OAuth configuration.
    this.envVars = {
      NEURODOCK_AUTH_PROVIDER: env.NEURODOCK_AUTH_PROVIDER,
      NEURODOCK_PUBLIC_URL: env.NEURODOCK_PUBLIC_URL,
      NEURODOCK_CLERK_DOMAIN: env.NEURODOCK_CLERK_DOMAIN,
      NEURODOCK_CLERK_CLIENT_ID: env.NEURODOCK_CLERK_CLIENT_ID,
      NEURODOCK_CLERK_CLIENT_SECRET: env.NEURODOCK_CLERK_CLIENT_SECRET ?? "",
      // The container binds all interfaces; the Worker is the only ingress.
      NEURODOCK_HTTP_HOST: "0.0.0.0",
      NEURODOCK_HTTP_PORT: "8000",
    };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const container = getContainer(env.NEURODOCK_REMOTE, "neurodock-remote");
    return container.fetch(request);
  },
} satisfies ExportedHandler<Env>;
