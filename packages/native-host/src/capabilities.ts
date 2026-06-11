/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Setup-capability detection for the `ping` op.
 *
 * The browser extension treats a reachable native host as "the one-command
 * setup ran"; these flags tell it *how much* of the setup ran, so the
 * power-up card can distinguish "profile sync only" from "hooks wired"
 * from "daemon registered". Detection is read-only and checks the same
 * on-disk markers that `neurodock guardrail status` reports:
 *
 *   hooks  → NeuroDock hook entries inside `~/.claude/settings.json`
 *            (the merge target of `neurodock install-hooks`).
 *   daemon → the user-login autostart marker written by
 *            `neurodock install-hooks --install-daemon`:
 *            HKCU Run value `NeuroDockGuardrail` on Windows,
 *            `~/Library/LaunchAgents/com.neurodock.guardrail.plist` on
 *            macOS, `~/.config/systemd/user/neurodock-guardrail.service`
 *            on Linux.
 *
 * Note: the daemon *script* (`~/.neurodock/hooks/neurodock_daemon.py`)
 * is NOT a daemon marker — `install-hooks` copies it unconditionally
 * even when the daemon was never enabled. Only the autostart
 * registration proves intent. Whether the daemon is currently *running*
 * is deliberately not reported: the only liveness signal is the mtime
 * of `~/.neurodock/state/daemon-log.jsonl`, which is a heuristic, not a
 * capability.
 */
import {
  existsSync as defaultExistsSync,
  readFileSync as defaultReadFileSync,
} from "node:fs";
import {
  homedir as defaultHomedir,
  platform as defaultPlatform,
} from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import type { SetupCapabilities } from "./protocol.js";

/** Markers written by `neurodock install-hooks` into settings.json. */
const HOOK_SCRIPT_MARKER = "proactive_guardrail.py";
const HOOK_DESCRIPTION_MARKER = "neurodock-proactive-guardrail";

/** Registry value name registered by the daemon's Windows autostart. */
const WINDOWS_RUN_VALUE = "NeuroDockGuardrail";

export interface CapabilityProbeDeps {
  readonly homedir?: () => string;
  readonly platform?: () => string;
  readonly existsSync?: (path: string) => boolean;
  readonly readFileSync?: (path: string) => string;
  /**
   * Windows only: returns true when the HKCU Run autostart value is
   * registered. Defaults to a `reg query` probe; tests inject a stub.
   */
  readonly windowsRunKeyRegistered?: () => boolean;
}

export function detectCapabilities(
  deps: CapabilityProbeDeps = {},
): SetupCapabilities {
  return {
    profile: true,
    hooks: detectHooks(deps),
    daemon: detectDaemon(deps),
  };
}

function detectHooks(deps: CapabilityProbeDeps): boolean {
  const home = (deps.homedir ?? defaultHomedir)();
  const exists = deps.existsSync ?? defaultExistsSync;
  const read = deps.readFileSync ?? defaultReadFile;
  const settingsPath = join(home, ".claude", "settings.json");
  if (!exists(settingsPath)) return false;
  try {
    const parsed = JSON.parse(read(settingsPath)) as { hooks?: unknown };
    const hooksText = JSON.stringify(parsed.hooks ?? {});
    return (
      hooksText.includes(HOOK_SCRIPT_MARKER) ||
      hooksText.includes(HOOK_DESCRIPTION_MARKER)
    );
  } catch {
    // Unreadable / unparseable settings.json: report not-installed rather
    // than guess. The CLI's `guardrail status` surfaces the parse error.
    return false;
  }
}

function detectDaemon(deps: CapabilityProbeDeps): boolean {
  const home = (deps.homedir ?? defaultHomedir)();
  const os = (deps.platform ?? defaultPlatform)();
  const exists = deps.existsSync ?? defaultExistsSync;
  if (os === "win32") {
    const probe = deps.windowsRunKeyRegistered ?? defaultWindowsRunKeyProbe;
    return probe();
  }
  if (os === "darwin") {
    return exists(
      join(home, "Library", "LaunchAgents", "com.neurodock.guardrail.plist"),
    );
  }
  return exists(
    join(home, ".config", "systemd", "user", "neurodock-guardrail.service"),
  );
}

function defaultReadFile(path: string): string {
  return defaultReadFileSync(path, "utf8");
}

function defaultWindowsRunKeyProbe(): boolean {
  try {
    // execFileSync (no shell) with a fully static argument list — the
    // registry path and value name are constants, never user input.
    const out = execFileSync(
      "reg",
      [
        "query",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
        "/v",
        WINDOWS_RUN_VALUE,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return out.includes(WINDOWS_RUN_VALUE);
  } catch {
    // reg query exits non-zero when the value is absent.
    return false;
  }
}
