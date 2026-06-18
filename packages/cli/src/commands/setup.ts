/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * `neurodock setup` — the "turn on full NeuroDock" command the browser
 * extension advertises. A thin orchestrator over the two existing
 * installers, in order:
 *
 *   1. `runInstallAll` — install the 6 Python MCP servers, wire the
 *      MCP clients, and register the native-messaging host (unless
 *      `--no-native-host`).
 *   2. `runInstallHooks` — wire the proactive-guardrail hooks into
 *      `~/.claude/settings.json`.
 *
 * The standalone Phase 3 daemon stays opt-in (`--daemon`), mirroring
 * `install-hooks --install-daemon`: the daemon is documented there as
 * optional — the Phase 1 Claude Code hook plus the Phase 2 extension
 * watchdog cover the common cases, so the default `setup` path does not
 * register login autostart on the user's machine.
 *
 * No installation logic lives here — both steps call the same runners
 * the standalone `install-all` / `install-hooks` commands use, so the
 * behaviours can never drift apart.
 */
import {
  runInstallAll as defaultRunInstallAll,
  type InstallAllResult,
  type InstallerChoice,
} from "./install-all.js";
import {
  runInstallHooks as defaultRunInstallHooks,
  type InstallHooksResult,
} from "./install-hooks.js";
import type { ClientId } from "../types.js";

export interface SetupOptions {
  readonly client: ClientId | "all";
  readonly profile: "minimal" | "example";
  readonly installer: InstallerChoice;
  readonly skipInstall: boolean;
  readonly yes: boolean;
  readonly dryRun: boolean;
  readonly noNativeHost: boolean;
  /**
   * Opt-in: also register the standalone guardrail daemon at user-login
   * autostart. Off by default — see the module comment above.
   */
  readonly daemon: boolean;
  /**
   * Extra browser-extension ids to allow on the native host (e.g. a
   * locally-loaded unpacked build). Passed through to install-all on top
   * of the published store ids.
   */
  readonly extensionIds?: ReadonlyArray<string>;
}

export interface SetupDependencies {
  /** Override the install-all runner. Tests inject a stub. */
  readonly runInstallAll?: typeof defaultRunInstallAll;
  /** Override the install-hooks runner. Tests inject a stub. */
  readonly runInstallHooks?: typeof defaultRunInstallHooks;
}

export interface SetupResult {
  readonly installAll: InstallAllResult;
  readonly hooks: InstallHooksResult;
  readonly messages: ReadonlyArray<string>;
  /** install-all's exit code wins when non-zero; else 1 if hooks failed. */
  readonly exitCode: number;
}

export async function runSetup(
  options: SetupOptions,
  deps: SetupDependencies = {},
): Promise<SetupResult> {
  const installAll = deps.runInstallAll ?? defaultRunInstallAll;
  const installHooks = deps.runInstallHooks ?? defaultRunInstallHooks;
  const messages: string[] = [];

  messages.push(
    "Step 1/2: install MCP servers, wire clients, register native host",
  );
  messages.push("");
  const installAllResult = await installAll({
    client: options.client,
    profile: options.profile,
    installer: options.installer,
    skipInstall: options.skipInstall,
    yes: options.yes,
    dryRun: options.dryRun,
    noNativeHost: options.noNativeHost,
    ...(options.extensionIds ? { extensionIds: options.extensionIds } : {}),
  });
  messages.push(...installAllResult.messages);

  // Run the hooks step even when install-all reported a problem: the
  // guardrail hooks only need Python, so a PATH hiccup with the MCP
  // entrypoints should not leave the user without proactive guardrails.
  messages.push("");
  messages.push("Step 2/2: install Claude Code guardrail hooks");
  messages.push("");
  const hooksResult = await installHooks({
    dryRun: options.dryRun,
    selfTest: false,
    uninstall: false,
    installDaemon: options.daemon,
  });
  messages.push(...hooksResult.messages);

  const exitCode =
    installAllResult.exitCode !== 0
      ? installAllResult.exitCode
      : hooksResult.exitCode !== 0
        ? 1
        : 0;

  messages.push("");
  if (exitCode === 0) {
    messages.push(
      options.dryRun
        ? "Dry run finished — nothing was written."
        : "Setup complete. NeuroDock is fully wired.",
    );
    if (!options.daemon) {
      messages.push(
        "Optional: 'neurodock setup --daemon' also registers the standalone guardrail daemon at login.",
      );
    }
  } else {
    messages.push(
      "Setup finished with problems — see the messages above. Re-run the failing step directly:",
    );
    if (installAllResult.exitCode !== 0) {
      messages.push("  neurodock install-all");
    }
    if (hooksResult.exitCode !== 0) {
      messages.push("  neurodock install-hooks");
    }
  }

  return {
    installAll: installAllResult,
    hooks: hooksResult,
    messages,
    exitCode,
  };
}
