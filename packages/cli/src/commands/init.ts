import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { atomicWriteOverwrite } from "../util/atomic-write.js";
import type {
  ClientDiff,
  ClientId,
  InitDiff,
  InitOptions,
  McpServerEntry,
} from "../types.js";
import { readEnv } from "../lib/env.js";
import {
  profilePath,
  detectClients,
  type DetectionResult,
} from "../lib/paths.js";
import { adapterFor } from "../clients/index.js";
import { mergeMcpServers, parseJsonSafely } from "../lib/json-patch.js";
import { writeProfileFromTemplate } from "../profile/loader.js";
import { buildMcpServers, detectRepoRoot } from "../lib/mcp-entries.js";

export interface InitRunResult {
  readonly diff: InitDiff;
  readonly applied: boolean;
  readonly messages: ReadonlyArray<string>;
}

export interface InitDependencies {
  /** Override the environment snapshot (for tests). */
  readonly envOverrides?: Parameters<typeof readEnv>[0];
}

export async function runInit(
  options: InitOptions,
  deps: InitDependencies = {},
): Promise<InitRunResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];

  // 1. Detect clients.
  const detections = detectClients(env);
  const targets = pickTargets(detections, options.client);
  const detectedTargets = targets.filter((t) => t.exists);

  if (options.client !== "all" && targets.length === 0) {
    messages.push(
      `No supported client locations exist for '${options.client}'.`,
    );
  }

  if (options.client === "all" && detectedTargets.length === 0) {
    messages.push("No supported MCP client detected.");
    messages.push("Looked for:");
    for (const t of targets) {
      messages.push(`  - ${t.id} (${t.scope}): ${t.path}`);
    }
    messages.push("See: https://docs.neurodock.org/install#supported-clients");
    return {
      diff: {
        profileAction: "skipped",
        profilePath: profilePath(env),
        clients: [],
      },
      applied: false,
      messages,
    };
  }

  // 2. Build the desired mcpServers entries once.
  const repoRoot = detectRepoRoot(env);
  const desiredServers = buildMcpServers({
    ...(repoRoot !== undefined ? { repoRoot } : {}),
  });

  // 3. Profile.
  const pPath = profilePath(env);
  const profileAction: InitDiff["profileAction"] = existsSync(pPath)
    ? "exists"
    : "create";

  // 4. Per-client diff.
  const clientDiffs: ClientDiff[] = [];
  // For "all" mode, only act on already-existing locations; for explicit
  // client choice, act on the highest-precedence path even if absent.
  const actOn: ReadonlyArray<DetectionResult> =
    options.client === "all" ? detectedTargets : targets.slice(0, 1);

  for (const target of actOn) {
    const diff = await diffClient(target, desiredServers, options);
    clientDiffs.push(diff);
  }

  const diff: InitDiff = {
    profileAction,
    profilePath: pPath,
    clients: clientDiffs,
  };

  if (options.dryRun) {
    return {
      diff,
      applied: false,
      messages: [
        "Dry run. No changes written.",
        ...messages,
        ...formatDiff(diff),
      ],
    };
  }

  // 5. Apply.
  // 5a. Profile.
  if (profileAction === "create") {
    const templatePath = resolveTemplatePath(options.profile);
    writeProfileFromTemplate({
      templatePath,
      targetPath: pPath,
      displayName: env.user,
    });
    messages.push(`Profile created at ${pPath}.`);
  } else {
    messages.push(`Profile already exists at ${pPath}. Left untouched.`);
  }

  // 5b. Client configs.
  for (const cd of clientDiffs) {
    if (cd.action === "create" || cd.action === "update") {
      applyClientDiff(cd, desiredServers, options.yes);
      messages.push(`Wired ${cd.client} at ${cd.path}.`);
    } else if (cd.action === "no-change") {
      messages.push(`${cd.client} already wired at ${cd.path}.`);
    } else if (cd.action === "skip") {
      messages.push(
        `Skipped ${cd.client} at ${cd.path}: ${
          cd.reason ?? "collision (re-run with --yes to overwrite)"
        }.`,
      );
    }
  }

  // 5c. What-next.
  messages.push("");
  messages.push("What next:");
  messages.push("  1. Restart your MCP client so it picks up the new servers.");
  messages.push(`  2. Edit ${pPath} to set your neurotypes and preferences.`);

  return { diff, applied: true, messages };
}

function pickTargets(
  detections: ReadonlyArray<DetectionResult>,
  client: ClientId | "all",
): ReadonlyArray<DetectionResult> {
  if (client === "all") return detections;
  return detections.filter((d) => d.id === client);
}

async function diffClient(
  target: DetectionResult,
  desired: Record<string, McpServerEntry>,
  options: InitOptions,
): Promise<ClientDiff> {
  let existing: Record<string, unknown> | null = null;
  if (existsSync(target.path)) {
    const raw = readFileSync(target.path, "utf8");
    const parsed = parseJsonSafely(raw);
    if (!parsed.ok) {
      return {
        client: target.id,
        path: target.path,
        action: "skip",
        added: [],
        collisions: [],
        reason: `existing config is not valid JSON: ${parsed.error}`,
      };
    }
    existing = (parsed.value as Record<string, unknown>) ?? {};
  }

  const merge = mergeMcpServers(
    (existing ?? {}) as { mcpServers?: Record<string, McpServerEntry> },
    desired,
    options.yes,
  );

  if (merge.collisions.length > 0 && !options.yes) {
    return {
      client: target.id,
      path: target.path,
      action: "skip",
      added: merge.added,
      collisions: merge.collisions,
      reason:
        "existing keys would be overwritten; re-run with --yes to confirm",
    };
  }

  if (merge.unchanged && existing !== null) {
    return {
      client: target.id,
      path: target.path,
      action: "no-change",
      added: [],
      collisions: [],
    };
  }

  return {
    client: target.id,
    path: target.path,
    action: existing === null ? "create" : "update",
    added: merge.added,
    collisions: merge.collisions,
  };
}

function applyClientDiff(
  cd: ClientDiff,
  desired: Record<string, McpServerEntry>,
  overwrite: boolean,
): void {
  const adapter = adapterFor(cd.client);
  let existing: unknown = null;
  if (existsSync(cd.path)) {
    const raw = readFileSync(cd.path, "utf8");
    const parsed = parseJsonSafely(raw);
    if (parsed.ok) existing = parsed.value;
  }
  const merged = mergeMcpServers(
    (existing as { mcpServers?: Record<string, McpServerEntry> }) ?? {},
    desired,
    overwrite,
  );
  const shaped = adapter.shapeConfig(
    existing,
    merged.merged.mcpServers as Record<string, McpServerEntry>,
  );
  mkdirSync(dirname(cd.path), { recursive: true });
  // Atomic overwrite: write to a .tmp sibling then rename into place to
  // prevent a TOCTOU window between existsSync (above) and the write.
  atomicWriteOverwrite(cd.path, `${JSON.stringify(shaped, null, 2)}\n`);
}

function resolveTemplatePath(profile: "minimal" | "example"): string {
  const filename =
    profile === "minimal" ? "profile.minimal.yaml" : "profile.example.yaml";
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "..", "..", "..", "core", "schemas", filename),
    resolve(here, "..", "..", "..", "..", "core", "schemas", filename),
    resolve(here, "..", "..", "core", "schemas", filename),
    join(process.cwd(), "packages", "core", "schemas", filename),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  throw new Error(`Could not locate template: ${filename}`);
}

function formatDiff(diff: InitDiff): string[] {
  const out: string[] = [];
  out.push(`Profile: ${diff.profileAction} -> ${diff.profilePath}`);
  for (const cd of diff.clients) {
    out.push(`Client ${cd.client} (${cd.action}): ${cd.path}`);
    for (const a of cd.added) out.push(`  + mcpServers.${a}`);
    for (const c of cd.collisions) out.push(`  ! mcpServers.${c} (collision)`);
    if (cd.reason) out.push(`  reason: ${cd.reason}`);
  }
  return out;
}
