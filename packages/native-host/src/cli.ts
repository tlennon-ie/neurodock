#!/usr/bin/env node
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
import { fileURLToPath } from "node:url";
import { realpathSync } from "node:fs";
import { runHost } from "./index.js";
import {
  detectPlatform,
  register,
  unregister,
  HOST_NAME,
} from "./registration/index.js";

const USAGE = `neurodock-native-host <command> [options]

Commands:
  install      Register the host with installed browsers.
               Options:
                 --extension-id <id>    Repeatable. Defaults to the published
                                        NeuroDock extension ID for each store.
  uninstall    Remove all NeuroDock host manifests / registry entries.
  run          Behave as the stdio native messaging host (default).
  --help       Print this help.
  --version    Print the host version.

Examples:
  neurodock-native-host install --extension-id abcdefghijklmnopqrstuvwxyzabcdef
  neurodock-native-host uninstall
`;

interface ParsedArgs {
  readonly command: "install" | "uninstall" | "run" | "help" | "version";
  readonly extensionIds: ReadonlyArray<string>;
}

function parseArgs(argv: ReadonlyArray<string>): ParsedArgs {
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
  return { command: "help", extensionIds: [] };
}

const DEFAULT_EXTENSION_IDS: ReadonlyArray<string> = [
  "__NEURODOCK_EXTENSION_ID__",
];

function resolveHostPath(): string {
  try {
    return realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return fileURLToPath(import.meta.url);
  }
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

export function main(
  argv: ReadonlyArray<string> = process.argv.slice(2),
): number {
  const parsed = parseArgs(argv);

  if (parsed.command === "help") {
    process.stdout.write(USAGE);
    return 0;
  }
  if (parsed.command === "version") {
    process.stdout.write("0.1.0\n");
    return 0;
  }
  if (parsed.command === "run") {
    runHost();
    return 0;
  }
  if (parsed.command === "install") {
    const ids =
      parsed.extensionIds.length > 0
        ? parsed.extensionIds
        : DEFAULT_EXTENSION_IDS;
    const platformId = detectPlatform();
    process.stdout.write(`Installing ${HOST_NAME} (platform=${platformId})\n`);
    const outcomes = register({
      hostPath: resolveHostPath(),
      allowedExtensionIds: ids,
    });
    printOutcomes(outcomes);
    return 0;
  }
  if (parsed.command === "uninstall") {
    const platformId = detectPlatform();
    process.stdout.write(`Removing ${HOST_NAME} (platform=${platformId})\n`);
    const outcomes = unregister();
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
  process.exit(main());
}
