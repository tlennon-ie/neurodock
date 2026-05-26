/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { readEnv, type EnvSnapshot } from "../lib/env.js";
import { runInit, type InitRunResult } from "./init.js";
import {
  runHostInstall as defaultRunHostInstall,
  type HostCommandResult,
} from "./host.js";
import type { ClientId } from "../types.js";

export type InstallerKind = "uv" | "pip";
export type InstallerChoice = InstallerKind | "auto";

export interface InstallAllOptions {
  readonly client: ClientId | "all";
  readonly profile: "minimal" | "example";
  readonly installer: InstallerChoice;
  readonly skipInstall: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
  /**
   * When true, skip the native-messaging host registration step. The host
   * is optional — it only matters if the user also installs the browser
   * extension — but we install it by default so the happy path is one
   * command.
   */
  readonly noNativeHost: boolean;
}

export interface NativeHostOutcome {
  /** "installed" = ran, "skipped" = --no-native-host or dry-run, "failed" = error caught. */
  readonly status: "installed" | "skipped" | "failed";
  readonly result?: HostCommandResult;
  readonly error?: string;
}

export interface PackageOutcome {
  readonly pkg: string;
  readonly entrypoint: string;
  /** install step succeeded (exit 0) or was skipped */
  readonly installed: boolean;
  /** entrypoint --help returned exit 0 */
  readonly onPath: boolean;
  /** install command stderr (if any) */
  readonly installError?: string;
  /** path-check stderr (if any) */
  readonly pathError?: string;
}

export interface InstallAllResult {
  /** "uv", "pip", or "skipped" / "dry-run" */
  readonly installer: InstallerKind | "skipped" | "dry-run";
  readonly packages: ReadonlyArray<PackageOutcome>;
  readonly initResult: InitRunResult | null;
  readonly nativeHost: NativeHostOutcome;
  readonly messages: ReadonlyArray<string>;
  /** 0 = ok, 1 = install/path failure, 2 = init failure */
  readonly exitCode: 0 | 1 | 2;
}

export interface InstallAllDependencies {
  readonly envOverrides?: Parameters<typeof readEnv>[0];
  /**
   * Override the spawn used to run install + --help commands. Defaults to
   * `child_process.spawnSync`. Tests inject a fake.
   */
  readonly spawn?: SpawnFn;
  /**
   * Override the init runner. Defaults to runInit. Tests can stub.
   */
  readonly runInit?: typeof runInit;
  /**
   * Override the native-host install step. Defaults to the real
   * `runHostInstall` from ./host.js. Tests inject a stub so they don't
   * touch the user's registry / config dirs.
   */
  readonly runHostInstall?: typeof defaultRunHostInstall;
}

export type SpawnFn = (
  command: string,
  args: ReadonlyArray<string>,
  options: { readonly env?: NodeJS.ProcessEnv },
) => SpawnResult;

export interface SpawnResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly error?: NodeJS.ErrnoException;
}

interface PackageSpec {
  readonly pkg: string;
  /** executable name expected on PATH after install */
  readonly entrypoint: string;
}

const PACKAGES: ReadonlyArray<PackageSpec> = [
  {
    pkg: "neurodock-mcp-chronometric",
    entrypoint: "neurodock-mcp-chronometric",
  },
  {
    pkg: "neurodock-mcp-cognitive-graph",
    entrypoint: "neurodock-mcp-cognitive-graph",
  },
  {
    pkg: "neurodock-mcp-task-fractionator",
    entrypoint: "neurodock-mcp-task-fractionator",
  },
  { pkg: "neurodock-mcp-translation", entrypoint: "neurodock-mcp-translation" },
  { pkg: "neurodock-mcp-guardrail", entrypoint: "neurodock-mcp-guardrail" },
  { pkg: "neurodock-evals", entrypoint: "neurodock-evals" },
];

const SUGGESTED_PROMPTS: ReadonlyArray<string> = [
  "What time is it and what's my energy zone?",
  "Remember: my dev box is Windows 11, Python 3.11, Node 22.",
  "Decompose this goal into atomic tasks with a PT3H budget: 'Get the changelog ready for v1.0.'",
];

export async function runInstallAll(
  options: InstallAllOptions,
  deps: InstallAllDependencies = {},
): Promise<InstallAllResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const spawn = deps.spawn ?? defaultSpawn;
  const init = deps.runInit ?? runInit;
  const hostInstall = deps.runHostInstall ?? defaultRunHostInstall;
  const messages: string[] = [];

  // Phase 1: pick installer.
  const installer = resolveInstaller(options.installer, env, spawn);

  if (options.skipInstall) {
    messages.push("Skipping Python package install (--skip-install).");
  } else if (options.dryRun) {
    messages.push(
      "Dry run. No packages installed and no client configs touched.",
    );
    messages.push(
      `Would install ${PACKAGES.length} packages using ${
        installer ?? "<no installer found>"
      }:`,
    );
    for (const p of PACKAGES) {
      messages.push(`  + ${p.pkg}`);
    }
    messages.push("");
    messages.push("Would then run 'neurodock init' equivalent:");
    messages.push(`  --client ${options.client} --profile ${options.profile}`);
    if (options.noNativeHost) {
      messages.push(
        "Would skip native-messaging host install (--no-native-host).",
      );
    } else {
      messages.push(
        "Would register the optional native-messaging host (browser extension <-> profile.yaml).",
      );
    }
    return {
      installer: "dry-run",
      packages: [],
      initResult: null,
      nativeHost: { status: "skipped" },
      messages,
      exitCode: 0,
    };
  } else if (installer === null) {
    messages.push(
      "Could not find an installer. Install 'uv' (https://docs.astral.sh/uv/) or ensure 'python3' / 'pip' is on PATH.",
    );
    return {
      installer: "skipped",
      packages: [],
      initResult: null,
      nativeHost: { status: "skipped" },
      messages,
      exitCode: 1,
    };
  }

  // Phase 2: install + verify each package (unless skipped).
  const outcomes: PackageOutcome[] = [];
  if (!options.skipInstall && installer !== null) {
    messages.push(
      `Installing ${PACKAGES.length} Python MCP servers via '${installer}'...`,
    );
    for (const spec of PACKAGES) {
      const outcome = installAndVerify(spec, installer, spawn);
      outcomes.push(outcome);
      messages.push(formatPackageLine(outcome));
    }
  } else if (options.skipInstall) {
    // Still verify path so the summary tells the truth.
    for (const spec of PACKAGES) {
      const onPath = checkOnPath(spec.entrypoint, spawn);
      outcomes.push({
        pkg: spec.pkg,
        entrypoint: spec.entrypoint,
        installed: true,
        onPath: onPath.ok,
        ...(onPath.error !== undefined ? { pathError: onPath.error } : {}),
      });
      messages.push(formatPackageLine(outcomes[outcomes.length - 1]!));
    }
  }

  const allOnPath = outcomes.every((o) => o.onPath);

  // Phase 3: run init.
  messages.push("");
  messages.push("Wiring MCP clients...");
  let initResult: InitRunResult | null = null;
  try {
    initResult = await init(
      {
        client: options.client,
        profile: options.profile,
        dryRun: false,
        yes: options.yes,
      },
      deps.envOverrides ? { envOverrides: deps.envOverrides } : {},
    );
    for (const m of initResult.messages) messages.push(m);
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    messages.push(`init failed: ${detail}`);
    return {
      installer: options.skipInstall ? "skipped" : installer ?? "skipped",
      packages: outcomes,
      initResult: null,
      nativeHost: { status: "skipped" },
      messages,
      exitCode: 2,
    };
  }

  // Phase 3.5: install the native-messaging host (optional, opt-out).
  // Failure here is non-fatal — the host only matters if the user also
  // installs the browser extension, and surfacing a warning is friendlier
  // than failing the whole "first-time install" command.
  const nativeHost = installNativeHost(options, hostInstall, messages);

  // Phase 4: summary + suggested prompts.
  const installedCount = outcomes.filter((o) => o.installed).length;
  const onPathCount = outcomes.filter((o) => o.onPath).length;
  const totalCount = outcomes.length;
  messages.push("");
  if (options.skipInstall) {
    messages.push(
      `Summary: skipped install. ${onPathCount}/${totalCount} on PATH. Wired clients.`,
    );
  } else {
    messages.push(
      `Summary: ${installedCount}/${totalCount} installed, ${onPathCount}/${totalCount} on PATH. Wired clients.`,
    );
  }
  messages.push("");
  messages.push("What this just did:");
  messages.push(
    "  - Installed 6 MCP servers via " +
      (options.skipInstall
        ? "pip (skipped)"
        : installer === "uv"
          ? "uv"
          : "pip"),
  );
  messages.push(
    "  - Wired your MCP-aware clients (Claude Desktop / Claude Code / Cursor)",
  );
  messages.push(`  - ${describeNativeHostBullet(nativeHost)}`);
  messages.push("");
  messages.push("Try one of these in your MCP client:");
  for (const p of SUGGESTED_PROMPTS) {
    messages.push(`  - ${p}`);
  }
  messages.push("");
  messages.push("See 'neurodock examples' for the full prompt cheat-sheet.");

  const exitCode: 0 | 1 | 2 = allOnPath ? 0 : 1;
  return {
    installer: options.skipInstall ? "skipped" : installer ?? "skipped",
    packages: outcomes,
    initResult,
    nativeHost,
    messages,
    exitCode,
  };
}

function installNativeHost(
  options: InstallAllOptions,
  hostInstall: typeof defaultRunHostInstall,
  messages: string[],
): NativeHostOutcome {
  messages.push("");
  if (options.noNativeHost) {
    messages.push("Skipping native-messaging host install (--no-native-host).");
    return { status: "skipped" };
  }

  messages.push(
    "Installing native-messaging host (browser extension <-> profile.yaml)...",
  );
  try {
    const result = hostInstall({ extensionIds: [] });
    for (const o of result.outcomes) {
      const detail = o.detail ? ` — ${o.detail}` : "";
      messages.push(
        `  [${o.action.padEnd(6)}] ${o.browser.padEnd(10)} ${
          o.manifestPath
        }${detail}`,
      );
    }
    return { status: "installed", result };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    messages.push(
      `  [warn] native-messaging host install failed: ${truncate(detail)}`,
    );
    messages.push(
      "  This is optional — only the browser extension uses it. Re-run 'neurodock host install' later if you want it.",
    );
    return { status: "failed", error: detail };
  }
}

function describeNativeHostBullet(outcome: NativeHostOutcome): string {
  if (outcome.status === "installed") {
    return "Installed the native-messaging host (lets the optional browser extension read your profile)";
  }
  if (outcome.status === "failed") {
    return "Native-messaging host install failed (optional — re-run 'neurodock host install' later)";
  }
  return "Skipped the native-messaging host (optional — run 'neurodock host install' if you want the browser extension to read your profile)";
}

function resolveInstaller(
  choice: InstallerChoice,
  env: EnvSnapshot,
  spawn: SpawnFn,
): InstallerKind | null {
  if (choice === "uv") return uvAvailable(spawn) ? "uv" : null;
  if (choice === "pip") return pipAvailable(env, spawn) ? "pip" : null;
  // auto
  if (uvAvailable(spawn)) return "uv";
  if (pipAvailable(env, spawn)) return "pip";
  return null;
}

function uvAvailable(spawn: SpawnFn): boolean {
  const r = spawn("uv", ["--version"], {});
  return r.status === 0;
}

function pipAvailable(_env: EnvSnapshot, spawn: SpawnFn): boolean {
  const r = spawn(pythonExe(), ["-m", "pip", "--version"], {});
  return r.status === 0;
}

function pythonExe(): string {
  // Prefer python3 on POSIX, but python on Windows where there is no python3.exe by default.
  return process.platform === "win32" ? "python" : "python3";
}

function installAndVerify(
  spec: PackageSpec,
  installer: InstallerKind,
  spawn: SpawnFn,
): PackageOutcome {
  let installed = false;
  let installError: string | undefined;
  if (installer === "uv") {
    const r = spawn("uv", ["tool", "install", spec.pkg], {});
    installed = r.status === 0;
    if (!installed)
      installError = (r.stderr || r.stdout || "uv tool install failed").trim();
  } else {
    const r = spawn(
      pythonExe(),
      ["-m", "pip", "install", "--upgrade", spec.pkg],
      {},
    );
    installed = r.status === 0;
    if (!installed)
      installError = (r.stderr || r.stdout || "pip install failed").trim();
  }

  const pathCheck = checkOnPath(spec.entrypoint, spawn);
  return {
    pkg: spec.pkg,
    entrypoint: spec.entrypoint,
    installed,
    onPath: pathCheck.ok,
    ...(installError !== undefined ? { installError } : {}),
    ...(pathCheck.error !== undefined ? { pathError: pathCheck.error } : {}),
  };
}

function checkOnPath(
  entrypoint: string,
  spawn: SpawnFn,
): { readonly ok: boolean; readonly error?: string } {
  const r = spawn(entrypoint, ["--help"], {});
  if (r.status === 0) return { ok: true };
  const err = (
    r.stderr ||
    r.stdout ||
    r.error?.message ||
    "command not found"
  ).trim();
  return { ok: false, error: err };
}

function formatPackageLine(o: PackageOutcome): string {
  if (o.onPath) {
    return `  [ok]   ${o.pkg}`;
  }
  if (!o.installed) {
    return `  [fail] ${o.pkg} — install failed: ${truncate(
      o.installError ?? "unknown",
    )}`;
  }
  return `  [warn] ${o.pkg} — installed but '${o.entrypoint}' not on PATH`;
}

function truncate(s: string, max = 120): string {
  const first = s.split("\n")[0] ?? "";
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}

function defaultSpawn(
  command: string,
  args: ReadonlyArray<string>,
  options: { readonly env?: NodeJS.ProcessEnv },
): SpawnResult {
  const r: SpawnSyncReturns<Buffer> = spawnSync(command, args as string[], {
    env: options.env ?? process.env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 120_000,
  });
  return {
    status: r.status,
    stdout: r.stdout ? r.stdout.toString("utf8") : "",
    stderr: r.stderr ? r.stderr.toString("utf8") : "",
    ...(r.error ? { error: r.error } : {}),
  };
}
