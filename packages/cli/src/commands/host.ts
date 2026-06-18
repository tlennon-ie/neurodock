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
 * The host package's bin (`neurodock-native-host run`) is the script Chrome
 * actually launches; this CLI subcommand only handles registering /
 * deregistering manifests and registry pointers.
 */
import { fileURLToPath } from "node:url";
import { existsSync, realpathSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import {
  register,
  unregister,
  detectPlatform,
  withDefaultExtensionIds,
} from "@neurodock/native-host/dist/registration/index.js";
import type { RegistrationOutcome } from "@neurodock/native-host/dist/registration/index.js";

export interface HostInstallOptions {
  readonly extensionIds: ReadonlyArray<string>;
}

export interface HostCommandResult {
  readonly platform: string;
  readonly outcomes: ReadonlyArray<RegistrationOutcome>;
}

function resolveHostBinPath(): string {
  // The bin lives at `<native-host package>/dist/cli.js`. We resolve it
  // relative to this module so the path works both from a checkout
  // (where the file is under packages/native-host/dist) and from a
  // published install (where it is under node_modules/@neurodock/native-host/dist).
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // dist/commands/host.js -> ../../node_modules/@neurodock/native-host/dist/cli.js
    resolve(
      here,
      "..",
      "..",
      "node_modules",
      "@neurodock",
      "native-host",
      "dist",
      "cli.js",
    ),
    // monorepo: dist/commands/host.js -> ../../../native-host/dist/cli.js
    resolve(here, "..", "..", "..", "native-host", "dist", "cli.js"),
    // monorepo sibling: dist/commands/host.js (cli) -> ../../../packages/native-host/dist/cli.js
    resolve(
      here,
      "..",
      "..",
      "..",
      "..",
      "packages",
      "native-host",
      "dist",
      "cli.js",
    ),
    // From cwd
    join(process.cwd(), "packages", "native-host", "dist", "cli.js"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      try {
        return realpathSync(c);
      } catch {
        return c;
      }
    }
  }
  // Fall back to "neurodock-native-host" on PATH; reg/manifest will still
  // be written but the actual host path may be unresolvable. Surface that
  // to the caller via the outcome rather than crashing.
  return "neurodock-native-host";
}

export function runHostInstall(opts: HostInstallOptions): HostCommandResult {
  // Always register the published store ids; caller-supplied ids (e.g. a
  // locally-loaded unpacked build) are added on top.
  const ids = withDefaultExtensionIds(opts.extensionIds);
  const platform = detectPlatform();
  const hostPath = resolveHostBinPath();
  const outcomes = register({ hostPath, allowedExtensionIds: ids });
  return { platform, outcomes };
}

export function runHostUninstall(): HostCommandResult {
  const platform = detectPlatform();
  const outcomes = unregister();
  return { platform, outcomes };
}
