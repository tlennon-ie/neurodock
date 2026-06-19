/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * `neurodock host` subcommands.
 *
 * Thin wrapper that delegates to `@neurodock/native-host`'s registration
 * module. We do not re-implement the per-OS dispatch here — the host
 * package owns it and exposes register / unregister functions.
 *
 * The connectable install path STAGES the host runtime into a stable
 * per-user directory and writes a launcher Chrome can actually execute, then
 * registers manifests/registry pointers whose `path` is the LAUNCHER. This
 * replaces the old behaviour of pointing the manifest at
 * `@neurodock/native-host/dist/cli.js` resolved relative to the running CLI:
 * under the documented `npx @neurodock/cli@latest setup` that path lands in
 * npm's `_npx` cache, which npm prunes/rotates — so the manifest eventually
 * pointed at a deleted file, and even when present a bare `.js` is not
 * launchable by Chrome on Windows. Staging + a launcher fixes both.
 */
import { fileURLToPath } from "node:url";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import {
  registerWithStaging,
  unregisterWithStaging,
  detectPlatform,
  withDefaultExtensionIds,
  resolveSourceDistDir,
  resolveInstalledLauncher,
  type StagingPlatform,
} from "@neurodock/native-host/dist/registration/index.js";
import {
  verifyLiveLaunch,
  type VerifyResult,
} from "@neurodock/native-host/dist/doctor.js";
import type { RegistrationOutcome } from "@neurodock/native-host/dist/registration/index.js";
import { homedir } from "node:os";

export interface HostInstallOptions {
  readonly extensionIds: ReadonlyArray<string>;
}

/**
 * Test seams: every value the staging path needs can be injected so the
 * per-OS behaviour is exercisable without touching the real %APPDATA% /
 * registry / config roots.
 */
export interface HostInstallDeps {
  readonly platform?: StagingPlatform;
  readonly home?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly sourceDistDir?: string;
  readonly nodePath?: string;
}

export interface HostCommandResult {
  readonly platform: string;
  readonly outcomes: ReadonlyArray<RegistrationOutcome>;
  /** The launcher the manifests now point at (absent on uninstall). */
  readonly launcherPath?: string;
}

/**
 * Resolve the native-host package's own `dist/` directory so we can stage it.
 * Resolved relative to this module so it works from a checkout (under
 * packages/native-host/dist) and from a published install (under
 * node_modules/@neurodock/native-host/dist). Falls back to the host package's
 * own `resolveSourceDistDir` when the layout is unexpected.
 */
function resolveHostDistDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(
      here,
      "..",
      "..",
      "node_modules",
      "@neurodock",
      "native-host",
      "dist",
    ),
    resolve(here, "..", "..", "..", "native-host", "dist"),
    resolve(here, "..", "..", "..", "..", "packages", "native-host", "dist"),
    join(process.cwd(), "packages", "native-host", "dist"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "cli.js"))) {
      try {
        return realpathSync(c);
      } catch {
        return c;
      }
    }
  }
  // Let the host package resolve from its own module location.
  return resolveSourceDistDir();
}

export function runHostInstall(
  opts: HostInstallOptions,
  deps: HostInstallDeps = {},
): HostCommandResult {
  // Always register the published store ids; caller-supplied ids (e.g. a
  // locally-loaded unpacked build) are added on top.
  const ids = withDefaultExtensionIds(opts.extensionIds);
  const sourceDistDir = deps.sourceDistDir ?? resolveHostDistDir();
  const result = registerWithStaging({
    allowedExtensionIds: ids,
    sourceDistDir,
    ...(deps.platform ? { platform: deps.platform } : {}),
    ...(deps.home ? { home: deps.home } : {}),
    ...(deps.env ? { env: deps.env } : {}),
    ...(deps.nodePath ? { nodePath: deps.nodePath } : {}),
  });
  return {
    platform: result.platform,
    outcomes: result.outcomes,
    launcherPath: result.launcherPath,
  };
}

/**
 * Test seams for the uninstall path: same injectable platform/home/env as
 * install so the symmetric removal is unit-testable in a sandbox.
 */
export interface HostUninstallDeps {
  readonly platform?: StagingPlatform;
  readonly home?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export function runHostUninstall(
  deps: HostUninstallDeps = {},
): HostCommandResult {
  const platform = deps.platform ?? detectPlatform();
  // Remove manifests/registry AND the staged runtime tree (no orphans).
  const outcomes = unregisterWithStaging({
    ...(deps.platform ? { platform: deps.platform } : {}),
    ...(deps.home ? { home: deps.home } : {}),
    ...(deps.env ? { env: deps.env } : {}),
  });
  return { platform, outcomes };
}

export interface HostVerifyResult {
  readonly ok: boolean;
  readonly launcherPath: string;
  readonly version: string | null;
  readonly detail?: string;
}

/**
 * Test seams for verify. Verify READS the installed manifest and spawns the
 * launcher it points at — it never stages/registers — so the only injectables
 * it needs are the OS coordinates and a stub spawner.
 */
export interface HostVerifyDeps {
  readonly platform?: StagingPlatform;
  readonly home?: string;
  readonly env?: NodeJS.ProcessEnv;
  /** Stub the live spawn-and-ping in tests; defaults to the real launcher. */
  readonly verify?: (launcherPath: string) => Promise<VerifyResult>;
}

/**
 * Live-launch verification used by `neurodock doctor`.
 *
 * Crucially this VERIFIES THE ALREADY-INSTALLED launcher — it reads the
 * on-disk Chromium native-messaging manifest, resolves the `path` Chrome
 * would launch, and spawns exactly that. It does NOT re-stage or re-register,
 * because doing so would repair a broken install behind the user's back and
 * make the diagnostic green even when the real installed manifest points at a
 * pruned `_npx` cli.js. If the host is not installed (no manifest), or the
 * manifest's launcher no longer exists, this returns a clear FAIL telling the
 * user to run `neurodock host install` — it never installs.
 */
export async function runHostVerify(
  deps: HostVerifyDeps = {},
): Promise<HostVerifyResult> {
  const platform: StagingPlatform | "unsupported" =
    deps.platform ??
    (detectPlatform() === "unsupported"
      ? "unsupported"
      : (detectPlatform() as StagingPlatform));
  if (platform === "unsupported") {
    return {
      ok: false,
      launcherPath: "",
      version: null,
      detail: "native messaging host is not supported on this platform",
    };
  }
  const home = deps.home ?? homedir();
  const env = deps.env ?? process.env;

  // READ the installed launcher from the on-disk manifest — never re-stage.
  const installed = resolveInstalledLauncher(platform, home, env);
  if (!installed.ok) {
    return {
      ok: false,
      launcherPath: installed.launcherPath,
      version: null,
      ...(installed.detail ? { detail: installed.detail } : {}),
    };
  }

  const verify = deps.verify ?? verifyLiveLaunch;
  const result = await verify(installed.launcherPath);
  return {
    ok: result.ok,
    launcherPath: installed.launcherPath,
    version: result.version,
    ...(result.detail ? { detail: result.detail } : {}),
  };
}
