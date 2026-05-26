/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Linux registration. Drops a manifest into each browser's per-user
 * NativeMessagingHosts directory under $XDG_CONFIG_HOME or ~/.config.
 */
import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { atomicWriteOverwrite } from "../util/atomic-write.js";
import {
  HOST_NAME,
  buildFirefoxManifest,
  buildManifest,
  type RegistrationOptions,
  type RegistrationOutcome,
  type UnregisterOptions,
} from "./types.js";

interface BrowserTarget {
  readonly browser: string;
  readonly dir: string;
  readonly firefox?: boolean;
}

function configRoot(home: string, env: NodeJS.ProcessEnv): string {
  const xdg = env["XDG_CONFIG_HOME"];
  return xdg && xdg.trim().length > 0 ? xdg : join(home, ".config");
}

function targets(
  home: string,
  env: NodeJS.ProcessEnv,
): ReadonlyArray<BrowserTarget> {
  const cfg = configRoot(home, env);
  return [
    {
      browser: "chrome",
      dir: join(cfg, "google-chrome", "NativeMessagingHosts"),
    },
    { browser: "chromium", dir: join(cfg, "chromium", "NativeMessagingHosts") },
    {
      browser: "brave",
      dir: join(cfg, "BraveSoftware", "Brave-Browser", "NativeMessagingHosts"),
    },
    {
      browser: "edge",
      dir: join(cfg, "microsoft-edge", "NativeMessagingHosts"),
    },
    { browser: "vivaldi", dir: join(cfg, "vivaldi", "NativeMessagingHosts") },
    {
      browser: "firefox",
      dir: join(home, ".mozilla", "native-messaging-hosts"),
      firefox: true,
    },
  ];
}

export function registerLinux(
  opts: RegistrationOptions,
): ReadonlyArray<RegistrationOutcome> {
  const home = opts.home ?? homedir();
  const out: RegistrationOutcome[] = [];
  for (const t of targets(home, process.env)) {
    const manifestPath = join(t.dir, `${HOST_NAME}.json`);
    try {
      mkdirSync(t.dir, { recursive: true });
      const manifest = t.firefox
        ? buildFirefoxManifest(opts)
        : buildManifest(opts);
      const action = existsSync(manifestPath) ? "update" : "create";
      // Atomic overwrite: the existsSync probe above and the write share a
      // TOCTOU window; rename-from-tmp closes it on POSIX.
      atomicWriteOverwrite(manifestPath, JSON.stringify(manifest, null, 2));
      out.push({ browser: t.browser, manifestPath, action });
    } catch (err) {
      out.push({
        browser: t.browser,
        manifestPath,
        action: "skip",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}

export function unregisterLinux(
  opts: UnregisterOptions = {},
): ReadonlyArray<RegistrationOutcome> {
  const home = opts.home ?? homedir();
  const out: RegistrationOutcome[] = [];
  for (const t of targets(home, process.env)) {
    const manifestPath = join(t.dir, `${HOST_NAME}.json`);
    if (!existsSync(manifestPath)) {
      out.push({
        browser: t.browser,
        manifestPath,
        action: "skip",
        detail: "manifest not present",
      });
      continue;
    }
    try {
      rmSync(manifestPath);
      out.push({ browser: t.browser, manifestPath, action: "remove" });
    } catch (err) {
      out.push({
        browser: t.browser,
        manifestPath,
        action: "skip",
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return out;
}
