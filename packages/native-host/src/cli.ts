#!/usr/bin/env node
/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * The `neurodock-native-host` bin.
 *
 *   install   – Register the host with every supported browser.
 *   uninstall – Remove every NeuroDock host manifest / registry key.
 *   run       – Behave as the stdio host. This is the path Chrome itself
 *               invokes; users do not normally type it.
 *
 * The bin defaults to `run` so the script can be wired directly into a
 * native-messaging manifest without a wrapper.
 */
import { homedir } from "node:os";
import { runHost } from "./index.js";
import {
  detectPlatform,
  registerWithStaging,
  unregisterWithStaging,
  resolveInstalledLauncher,
  withDefaultExtensionIds,
  HOST_NAME,
  type StagingPlatform,
} from "./registration/index.js";
import { verifyLiveLaunch } from "./doctor.js";
import { HOST_VERSION } from "./protocol.js";

const USAGE = `neurodock-native-host <command> [options]

Commands:
  install      Register the host with installed browsers.
               Options:
                 --extension-id <id>    Repeatable. Defaults to the published
                                        NeuroDock extension ID for each store.
  uninstall    Remove all NeuroDock host manifests / registry entries.
  doctor       Spawn the registered launcher and verify a live ping/pong.
  run          Behave as the stdio native messaging host (default).
  --help       Print this help.
  --version    Print the host version.

Examples:
  neurodock-native-host install --extension-id abcdefghijklmnopqrstuvwxyzabcdef
  neurodock-native-host uninstall
  neurodock-native-host doctor
`;

interface ParsedArgs {
  readonly command:
    | "install"
    | "uninstall"
    | "doctor"
    | "run"
    | "help"
    | "version";
  readonly extensionIds: ReadonlyArray<string>;
}

/**
 * Parse the bin's argv.
 *
 * Critically, Chrome launches the host with the calling extension's ORIGIN as
 * the first arg (e.g. `chrome-extension://<id>/`; on Windows also a
 * `--parent-window=` arg). Any first arg that is NOT a known subcommand must
 * route to `run`, NOT to help — otherwise the host greets Chrome with usage
 * text and the port disconnects. Only the explicit management subcommands and
 * the help/version flags are recognised; everything else is `run`.
 */
export function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
  if (argv.length === 0) {
    return { command: "run", extensionIds: [] };
  }
  const first = argv[0];
  if (first === "--help" || first === "-h") {
    return { command: "help", extensionIds: [] };
  }
  if (first === "--version" || first === "-v") {
    return { command: "version", extensionIds: [] };
  }
  if (first === "run") {
    return { command: "run", extensionIds: [] };
  }
  if (first === "doctor") {
    return { command: "doctor", extensionIds: [] };
  }
  if (first === "install" || first === "uninstall") {
    const ids: string[] = [];
    for (let i = 1; i < argv.length; i += 1) {
      const arg = argv[i];
      if (arg === "--extension-id" && i + 1 < argv.length) {
        const nextArg = argv[i + 1];
        if (nextArg !== undefined) {
          ids.push(nextArg);
        }
        i += 1;
      }
    }
    return { command: first, extensionIds: ids };
  }
  // Unrecognised first arg (a Chrome-supplied origin / --parent-window=, or
  // anything else): behave as the stdio host. This is belt-and-suspenders for
  // the launcher, which already forces `run`, and keeps an older
  // direct-cli.js manifest working.
  return { command: "run", extensionIds: [] };
}

interface PrintableOutcome {
  readonly browser: string;
  readonly manifestPath: string;
  readonly action: string;
  readonly detail?: string | undefined;
}

function printOutcomes(outcomes: ReadonlyArray<PrintableOutcome>): void {
  for (const o of outcomes) {
    const detail = o.detail ? ` — ${o.detail}` : "";
    process.stdout.write(
      `  [${o.action.padEnd(6)}] ${o.browser.padEnd(10)} ${
        o.manifestPath
      }${detail}\n`,
    );
  }
}

/**
 * Run the bin. Returns an exit code for terminal subcommands, or `null` for
 * `run` — the stdio host owns the process lifecycle and exits only when
 * stdin closes, so the caller must NOT `process.exit` after a `run`. (The
 * original code did, killing the host before it could read a single frame —
 * the deepest layer of defect #3.)
 */
export async function main(
  argv: ReadonlyArray<string> = process.argv.slice(2),
): Promise<number | null> {
  const parsed = parseArgs(argv);

  if (parsed.command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (parsed.command === "version") {
    process.stdout.write(`${HOST_VERSION}\n`);
    return 0;
  }
  if (parsed.command === "run") {
    runHost();
    return null;
  }
  if (parsed.command === "install") {
    // Always register the published store ids; any --extension-id values
    // (e.g. a locally-loaded unpacked build) are added on top.
    const ids = withDefaultExtensionIds(parsed.extensionIds);
    const platformId = detectPlatform();
    process.stdout.write(`Installing ${HOST_NAME} (platform=${platformId})\n`);
    // Stage the runtime into a stable per-user dir and register manifests
    // whose `path` is the launcher (never this npx-cache cli.js).
    const result = registerWithStaging({ allowedExtensionIds: ids });
    process.stdout.write(`  launcher: ${result.launcherPath}\n`);
    printOutcomes(result.outcomes);
    return 0;
  }
  if (parsed.command === "doctor") {
    process.stdout.write(`Verifying ${HOST_NAME} live launch...\n`);
    const platform = detectPlatform();
    if (platform === "unsupported") {
      process.stdout.write(
        "  [fail] native messaging host is not supported on this platform\n",
      );
      return 1;
    }
    // READ the installed launcher from the on-disk manifest — verify the
    // user's REAL install, never re-stage (which would mask a broken install).
    const installed = resolveInstalledLauncher(
      platform as StagingPlatform,
      homedir(),
      process.env,
    );
    if (!installed.ok) {
      process.stdout.write(
        `  [fail] ${installed.detail ?? "native host not installed"}\n`,
      );
      return 1;
    }
    process.stdout.write(`  launcher: ${installed.launcherPath}\n`);
    const verify = await verifyLiveLaunch(installed.launcherPath);
    if (verify.ok) {
      process.stdout.write(
        `  [ok] host responded to ping (version ${verify.version ?? "?"})\n`,
      );
      return 0;
    }
    process.stdout.write(
      `  [fail] ${verify.detail ?? "host did not respond"}\n`,
    );
    return 1;
  }
  if (parsed.command === "uninstall") {
    const platformId = detectPlatform();
    process.stdout.write(`Removing ${HOST_NAME} (platform=${platformId})\n`);
    // Symmetric uninstall: manifests/registry AND the staged runtime tree.
    const outcomes = unregisterWithStaging();
    printOutcomes(outcomes);
    return 0;
  }
  process.stdout.write(USAGE);
  return 1;
}

const invokedFromCli =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("cli.js") ||
    process.argv[1].endsWith("neurodock-native-host"));

if (invokedFromCli) {
  void main().then((code) => {
    // `run` returns null: the host keeps the process alive until stdin
    // closes, so do not exit here. Terminal subcommands return a number.
    if (code !== null) {
      process.exit(code);
    }
  });
}
