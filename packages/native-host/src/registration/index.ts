/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Platform-dispatching registration entry point used by `neurodock host install`
 * and the bin `neurodock-native-host install`.
 */
import { homedir, platform } from "node:os";
import { registerDarwin, unregisterDarwin } from "./darwin.js";
import { registerLinux, unregisterLinux } from "./linux.js";
import { registerWindows, unregisterWindows } from "./windows.js";
import {
  resolveSourceDistDir,
  stageRuntime,
  removeStagedRuntime,
  type StagingPlatform,
} from "./staging.js";
import type {
  RegistrationOptions,
  RegistrationOutcome,
  UnregisterOptions,
} from "./types.js";

export type SupportedPlatform = "darwin" | "linux" | "win32";

export function detectPlatform(): SupportedPlatform | "unsupported" {
  const p = platform();
  if (p === "darwin" || p === "linux" || p === "win32") return p;
  return "unsupported";
}

export function register(
  opts: RegistrationOptions,
): ReadonlyArray<RegistrationOutcome> {
  const p = detectPlatform();
  switch (p) {
    case "darwin":
      return registerDarwin(opts);
    case "linux":
      return registerLinux(opts);
    case "win32":
      return registerWindows(opts);
    default:
      return [
        {
          browser: "unsupported",
          manifestPath: "",
          action: "skip",
          detail: `Platform ${platform()} is not supported. Open an issue if you need this.`,
        },
      ];
  }
}

export function unregister(
  opts: UnregisterOptions = {},
): ReadonlyArray<RegistrationOutcome> {
  const p = detectPlatform();
  switch (p) {
    case "darwin":
      return unregisterDarwin(opts);
    case "linux":
      return unregisterLinux(opts);
    case "win32":
      return unregisterWindows(opts);
    default:
      return [
        {
          browser: "unsupported",
          manifestPath: "",
          action: "skip",
          detail: `Platform ${platform()} is not supported.`,
        },
      ];
  }
}

/**
 * Register one platform directly, bypassing live OS detection. Used by
 * `registerWithStaging` so the per-OS path is exercisable in tests.
 */
function registerForPlatform(
  p: StagingPlatform,
  opts: RegistrationOptions,
): ReadonlyArray<RegistrationOutcome> {
  switch (p) {
    case "darwin":
      return registerDarwin(opts);
    case "linux":
      return registerLinux(opts);
    case "win32":
      return registerWindows(opts);
  }
}

function unregisterForPlatform(
  p: StagingPlatform,
  opts: UnregisterOptions,
): ReadonlyArray<RegistrationOutcome> {
  switch (p) {
    case "darwin":
      return unregisterDarwin(opts);
    case "linux":
      return unregisterLinux(opts);
    case "win32":
      return unregisterWindows(opts);
  }
}

export interface UnregisterWithStagingOptions {
  readonly platform?: StagingPlatform;
  readonly home?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * The symmetric uninstall: remove manifests / registry pointers AND the
 * staged runtime tree, so nothing the install step created is left behind.
 */
export function unregisterWithStaging(
  opts: UnregisterWithStagingOptions = {},
): ReadonlyArray<RegistrationOutcome> {
  const detected = detectPlatform();
  const p: StagingPlatform | "unsupported" =
    opts.platform ?? (detected === "unsupported" ? "unsupported" : detected);
  if (p === "unsupported") {
    return unregister(opts);
  }
  const home = opts.home ?? homedir();
  const env = opts.env ?? process.env;
  const outcomes = unregisterForPlatform(p, { home, env });
  removeStagedRuntime(p, home, env);
  return outcomes;
}

export interface RegisterWithStagingOptions {
  readonly allowedExtensionIds: ReadonlyArray<string>;
  /** Defaults to the live OS; tests pass an explicit platform. */
  readonly platform?: StagingPlatform;
  /** Defaults to `os.homedir()`. */
  readonly home?: string;
  /** Defaults to `process.env`. */
  readonly env?: NodeJS.ProcessEnv;
  /**
   * The native-host `dist/` to copy from. Defaults to this package's own
   * dist, resolved from the running module.
   */
  readonly sourceDistDir?: string;
  /**
   * Absolute node binary embedded in the launcher. Defaults to the node
   * running the installer (`process.execPath`).
   */
  readonly nodePath?: string;
}

export interface RegisterWithStagingResult {
  readonly platform: SupportedPlatform | "unsupported";
  readonly launcherPath: string;
  readonly runtimeDir: string;
  readonly outcomes: ReadonlyArray<RegistrationOutcome>;
}

/**
 * The connectable install path: stage the runtime into a stable per-user
 * dir, write a launcher Chrome can execute, then register manifests/registry
 * pointers whose `path` is the LAUNCHER (never the raw, npx-cache cli.js).
 */
export function registerWithStaging(
  opts: RegisterWithStagingOptions,
): RegisterWithStagingResult {
  const detected = detectPlatform();
  const p: StagingPlatform | "unsupported" =
    opts.platform ?? (detected === "unsupported" ? "unsupported" : detected);

  if (p === "unsupported") {
    return {
      platform: "unsupported",
      launcherPath: "",
      runtimeDir: "",
      outcomes: [
        {
          browser: "unsupported",
          manifestPath: "",
          action: "skip",
          detail: `Platform ${platform()} is not supported. Open an issue if you need this.`,
        },
      ],
    };
  }

  const home = opts.home ?? homedir();
  const env = opts.env ?? process.env;
  const sourceDistDir = opts.sourceDistDir ?? resolveSourceDistDir();
  const nodePath = opts.nodePath ?? process.execPath;

  const staged = stageRuntime({
    platform: p,
    home,
    env,
    sourceDistDir,
    nodePath,
  });

  const outcomes = registerForPlatform(p, {
    hostPath: staged.launcherPath,
    allowedExtensionIds: opts.allowedExtensionIds,
    home,
    env,
  });

  return {
    platform: p,
    launcherPath: staged.launcherPath,
    runtimeDir: staged.runtimeDir,
    outcomes,
  };
}

export type {
  RegistrationOptions,
  RegistrationOutcome,
  UnregisterOptions,
} from "./types.js";
export {
  HOST_NAME,
  PUBLISHED_EXTENSION_IDS,
  withDefaultExtensionIds,
} from "./types.js";
export {
  resolveSourceDistDir,
  stableRuntimeDir,
  chromiumManifestPath,
  resolveInstalledLauncher,
  type InstalledLauncher,
  type StagingPlatform,
} from "./staging.js";
