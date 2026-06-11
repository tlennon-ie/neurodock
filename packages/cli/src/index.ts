#!/usr/bin/env node
/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
import { Command } from "commander";
import chalk from "chalk";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runProfileValidate, runProfileShow } from "./commands/profile.js";
import { runValidate, formatViolation } from "./commands/validate.js";
import { runUpdate } from "./commands/update.js";
import { runSync } from "./commands/sync.js";
import { runUninstall } from "./commands/uninstall.js";
import { runHostInstall, runHostUninstall } from "./commands/host.js";
import { runInstallHooks } from "./commands/install-hooks.js";
import { runGuardrailStatus } from "./commands/guardrail.js";
import { runInstallAll, type InstallerChoice } from "./commands/install-all.js";
import { runSetup } from "./commands/setup.js";
import { runExamples } from "./commands/examples.js";
import {
  runPluginAdd,
  runPluginRemove,
  runPluginList,
  runPluginEnable,
  runPluginDisable,
  runPluginValidate,
} from "./commands/plugin.js";
import { colorEnabled } from "./lib/env.js";
import type { CheckResult, ClientId } from "./types.js";

// 0.6.2: read version from package.json at module load instead of a
// hardcoded string. The previous string went stale at every release
// (0.6.1 still reported 0.5.0 to `--version`); reading the manifest
// makes it impossible to drift again. Works from both dist/index.js
// (../package.json) and src/index.ts when run via tsx.
function resolveCliVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const raw = readFileSync(join(here, "..", "package.json"), "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === "string" && parsed.version.length > 0) {
      return parsed.version;
    }
  } catch {
    // Fall through to the safe default — the published tarball will
    // always have a readable package.json, so this only happens in
    // unusual harness situations.
  }
  return "unknown";
}

export const CLI_VERSION = resolveCliVersion();

export function buildProgram(): Command {
  const program = new Command();
  program
    .name("neurodock")
    .description("NeuroDock installer and diagnostic CLI.")
    .version(CLI_VERSION, "-v, --version", "print the version")
    .helpOption("-h, --help", "show help");

  program
    .command("init")
    .description("install NeuroDock MCP servers into your MCP-aware clients")
    .option(
      "--client <id>",
      "claude-desktop | claude-code | cursor | all",
      "all",
    )
    .option("--profile <id>", "minimal | example", "example")
    .option("--dry-run", "print the diff without writing anything", false)
    .option(
      "--yes",
      "answer yes to all prompts (idempotent re-runs, collisions)",
      false,
    )
    .action(
      async (opts: {
        client: string;
        profile: string;
        dryRun: boolean;
        yes: boolean;
      }) => {
        const client = validateClient(opts.client);
        const profile = validateProfile(opts.profile);
        const result = await runInit({
          client,
          profile,
          dryRun: opts.dryRun,
          yes: opts.yes,
        });
        for (const m of result.messages) print(m);
        process.exit(0);
      },
    );

  program
    .command("install-all")
    .description(
      "install the 6 Python MCP servers and wire MCP clients in one step",
    )
    .option(
      "--client <id>",
      "claude-desktop | claude-code | cursor | all",
      "all",
    )
    .option("--profile <id>", "minimal | example", "example")
    .option("--installer <id>", "uv | pip | auto", "auto")
    .option(
      "--skip-install",
      "skip the Python install step (only run init)",
      false,
    )
    .option(
      "--yes",
      "answer yes to all prompts (idempotent re-runs, collisions)",
      false,
    )
    .option(
      "--dry-run",
      "print what would happen without writing anything",
      false,
    )
    .option(
      "--no-native-host",
      "skip registering the optional native-messaging host (browser extension <-> profile.yaml)",
    )
    .action(
      async (opts: {
        client: string;
        profile: string;
        installer: string;
        skipInstall: boolean;
        yes: boolean;
        dryRun: boolean;
        // Commander inverts `--no-native-host`: presence of the flag sets this to false.
        nativeHost: boolean;
      }) => {
        const client = validateClient(opts.client);
        const profile = validateProfile(opts.profile);
        const installer = validateInstaller(opts.installer);
        const r = await runInstallAll({
          client,
          profile,
          installer,
          skipInstall: opts.skipInstall === true,
          yes: opts.yes === true,
          dryRun: opts.dryRun === true,
          noNativeHost: opts.nativeHost === false,
        });
        for (const m of r.messages) print(m);
        process.exit(r.exitCode);
      },
    );

  program
    .command("setup")
    .description(
      "full setup in one command: runs install-all (6 MCP servers + client " +
        "wiring + native-messaging host) then install-hooks (Claude Code " +
        "guardrail hooks); the standalone daemon is opt-in via --daemon",
    )
    .option(
      "--client <id>",
      "claude-desktop | claude-code | cursor | all",
      "all",
    )
    .option("--profile <id>", "minimal | example", "example")
    .option("--installer <id>", "uv | pip | auto", "auto")
    .option(
      "--skip-install",
      "skip the Python install step (only wire clients + hooks)",
      false,
    )
    .option(
      "--yes",
      "answer yes to all prompts (idempotent re-runs, collisions)",
      false,
    )
    .option(
      "--dry-run",
      "print what would happen without writing anything",
      false,
    )
    .option(
      "--no-native-host",
      "skip registering the optional native-messaging host (browser extension <-> profile.yaml)",
    )
    .option(
      "--daemon",
      "also register the optional standalone guardrail daemon at user-login " +
        "autostart (off by default — the Claude Code hook covers the common cases)",
      false,
    )
    .action(
      async (opts: {
        client: string;
        profile: string;
        installer: string;
        skipInstall: boolean;
        yes: boolean;
        dryRun: boolean;
        // Commander inverts `--no-native-host`: presence of the flag sets this to false.
        nativeHost: boolean;
        daemon: boolean;
      }) => {
        const client = validateClient(opts.client);
        const profile = validateProfile(opts.profile);
        const installer = validateInstaller(opts.installer);
        const r = await runSetup({
          client,
          profile,
          installer,
          skipInstall: opts.skipInstall === true,
          yes: opts.yes === true,
          dryRun: opts.dryRun === true,
          noNativeHost: opts.nativeHost === false,
          daemon: opts.daemon === true,
        });
        for (const m of r.messages) print(m);
        process.exit(r.exitCode);
      },
    );

  program
    .command("examples")
    .description(
      "print copy-pasteable prompts that exercise every wired NeuroDock MCP tool",
    )
    .option(
      "--server <name>",
      "filter to a single server (e.g. neurodock-chronometric)",
    )
    .option("--json", "print the example data as JSON for scripting", false)
    .action(async (opts: { server?: string; json: boolean }) => {
      const r = await runExamples({
        ...(opts.server !== undefined ? { server: opts.server } : {}),
        json: opts.json === true,
      });
      for (const m of r.messages) print(m);
      process.exit(0);
    });

  program
    .command("doctor")
    .description("diagnose your NeuroDock installation")
    .action(async () => {
      const r = await runDoctor();
      print("NeuroDock doctor");
      print("");
      for (const c of r.checks) print(formatCheck(c));
      print("");
      print(r.ok ? "All checks passed." : "One or more checks failed.");
      process.exit(r.ok ? 0 : 1);
    });

  const profileCmd = program
    .command("profile")
    .description("profile utilities");

  profileCmd
    .command("validate")
    .description("validate ~/.neurodock/profile.yaml against the schema")
    .action(async () => {
      const r = await runProfileValidate();
      if (r.missing) {
        print(`No profile at ${r.path}. Run 'neurodock init' to create one.`);
        process.exit(1);
      }
      if (r.result.valid) {
        print(`Valid: ${r.path}`);
        process.exit(0);
      }
      print(`Invalid: ${r.path}`);
      for (const v of r.result.violations) {
        print(`  ${v.path} (${v.keyword}): ${v.message}`);
      }
      process.exit(1);
    });

  profileCmd
    .command("show")
    .description("print the resolved profile (with loader defaults applied)")
    .action(async () => {
      const r = await runProfileShow();
      if (r.missing) {
        print(`No profile at ${r.path}.`);
        process.exit(1);
      }
      process.stdout.write(r.yaml);
      process.exit(0);
    });

  program
    .command("validate")
    .description("validate a NeuroDock profile against the canonical schema")
    .option(
      "--file <path>",
      "path to the profile file (default: resolved profile path)",
    )
    .option(
      "--strict",
      "also flag unknown keys (default allows forward-compat extras)",
      false,
    )
    .action(async (opts: { file?: string; strict: boolean }) => {
      const r = await runValidate({
        ...(opts.file !== undefined ? { file: opts.file } : {}),
        strict: opts.strict === true,
      });
      if (r.missing) {
        print(
          `No profile at ${r.resolvedPath}. Run 'neurodock init' to create one.`,
        );
        process.exit(1);
      }
      if (r.parseError) {
        print(`Parse error in ${r.resolvedPath}: ${r.parseError}`);
        process.exit(1);
      }
      if (r.valid) {
        print(`Valid: ${r.resolvedPath}`);
        process.exit(0);
      }
      print(`Invalid: ${r.resolvedPath}`);
      for (const v of r.violations) {
        print(formatViolation(v, r.resolvedPath));
      }
      process.exit(1);
    });

  program
    .command("update")
    .description(
      "upgrade NeuroDock to the latest version (re-installs MCP servers and re-wires clients)",
    )
    .option(
      "--client <id>",
      "claude-desktop | claude-code | cursor | all",
      "all",
    )
    .option("--profile <id>", "minimal | example", "example")
    .option("--installer <id>", "uv | pip | auto", "auto")
    .option(
      "--skip-install",
      "skip the Python upgrade step (only re-wire clients)",
      false,
    )
    .option(
      "--yes",
      "answer yes to all prompts (idempotent re-runs, collisions)",
      false,
    )
    .option(
      "--dry-run",
      "print what would happen without writing anything",
      false,
    )
    .option(
      "--no-native-host",
      "skip re-registering the optional native-messaging host",
    )
    .action(
      async (opts: {
        client: string;
        profile: string;
        installer: string;
        skipInstall: boolean;
        yes: boolean;
        dryRun: boolean;
        nativeHost: boolean;
      }) => {
        const client = validateClient(opts.client);
        const profile = validateProfile(opts.profile);
        const installer = validateInstaller(opts.installer);
        const r = await runUpdate({
          client,
          profile,
          installer,
          skipInstall: opts.skipInstall === true,
          yes: opts.yes === true,
          dryRun: opts.dryRun === true,
          noNativeHost: opts.nativeHost === false,
        });
        for (const m of r.messages) print(m);
        process.exit(r.exitCode);
      },
    );

  program
    .command("sync")
    .description(
      "re-shape NeuroDock MCP entries in existing client configs (no package upgrade)",
    )
    .option(
      "--client <id>",
      "claude-desktop | claude-code | cursor | all",
      "all",
    )
    .option("--dry-run", "print the diff without writing anything", false)
    .action(async (opts: { client: string; dryRun: boolean }) => {
      const client = validateClient(opts.client);
      const r = await runSync({ client, dryRun: opts.dryRun === true });
      for (const m of r.messages) print(m);
      process.exit(0);
    });

  program
    .command("uninstall")
    .description(
      "remove NeuroDock MCP entries from your clients; optionally purge data",
    )
    .option(
      "--client <id>",
      "claude-desktop | claude-code | cursor | all",
      "all",
    )
    .option("--dry-run", "print the diff without writing anything", false)
    .option(
      "--yes",
      "skip interactive prompts (still preserves data unless --purge)",
      false,
    )
    .option(
      "--purge",
      "also delete ~/.neurodock/profile.yaml and cognitive-graph.sqlite",
      false,
    )
    .action(
      async (opts: {
        client: string;
        dryRun: boolean;
        yes: boolean;
        purge: boolean;
      }) => {
        const client = validateClient(opts.client);
        const r = await runUninstall({
          client,
          dryRun: opts.dryRun === true,
          yes: opts.yes === true,
          purge: opts.purge === true,
        });
        for (const m of r.messages) print(m);
        process.exit(0);
      },
    );

  program
    .command("install-hooks")
    .description(
      "wire NeuroDock's proactive guardrails into ~/.claude/settings.json " +
        "(auto-detects hyperfocus, late-night work, rumination, sycophancy)",
    )
    .option(
      "--dry-run",
      "print what would happen without writing settings.json",
      false,
    )
    .option(
      "--self-test",
      "after installing, run the script's smoke test to verify Python is on PATH",
      false,
    )
    .option(
      "--uninstall",
      "remove NeuroDock hook entries from settings.json (leaves the script)",
      false,
    )
    .option(
      "--install-daemon",
      "also register the standalone daemon at user-login autostart " +
        "(HKCU Run on Windows, LaunchAgent on macOS, systemd --user on Linux)",
      false,
    )
    .action(
      async (opts: {
        dryRun: boolean;
        selfTest: boolean;
        uninstall: boolean;
        installDaemon: boolean;
      }) => {
        const r = await runInstallHooks({
          dryRun: opts.dryRun === true,
          selfTest: opts.selfTest === true,
          uninstall: opts.uninstall === true,
          installDaemon: opts.installDaemon === true,
        });
        for (const m of r.messages) print(m);
        process.exit(r.exitCode);
      },
    );

  const guardrailCmd = program
    .command("guardrail")
    .description("diagnose the proactive guardrail wiring (hooks, daemon)");
  guardrailCmd
    .command("status")
    .description(
      "print which proactive-guardrail pieces are wired and which are missing",
    )
    .action(() => {
      const r = runGuardrailStatus({ print });
      process.exit(r.exitCode);
    });

  const hostCmd = program
    .command("host")
    .description(
      "manage the optional native messaging host (browser extension <-> ~/.neurodock/profile.yaml)",
    );

  hostCmd
    .command("install")
    .description(
      "register the NeuroDock native messaging host with installed browsers",
    )
    .option(
      "--extension-id <id>",
      "browser extension id allowed to connect (repeatable)",
      (value: string, prev: string[]) => [...prev, value],
      [] as string[],
    )
    .action((opts: { extensionId: string[] }) => {
      const result = runHostInstall({ extensionIds: opts.extensionId });
      print(`Installing com.neurodock.profile (platform=${result.platform})`);
      for (const o of result.outcomes) {
        const detail = o.detail ? ` — ${o.detail}` : "";
        print(
          `  [${o.action.padEnd(6)}] ${o.browser.padEnd(10)} ${
            o.manifestPath
          }${detail}`,
        );
      }
      process.exit(0);
    });

  hostCmd
    .command("uninstall")
    .description(
      "remove the NeuroDock native messaging host manifests / registry pointers",
    )
    .action(() => {
      const result = runHostUninstall();
      print(`Removing com.neurodock.profile (platform=${result.platform})`);
      for (const o of result.outcomes) {
        const detail = o.detail ? ` — ${o.detail}` : "";
        print(
          `  [${o.action.padEnd(6)}] ${o.browser.padEnd(10)} ${
            o.manifestPath
          }${detail}`,
        );
      }
      process.exit(0);
    });

  const pluginCmd = program
    .command("plugin")
    .description(
      "manage NeuroDock plugins under ~/.neurodock/plugins/ (see ADR 0007)",
    );

  pluginCmd
    .command("add <source>")
    .description(
      "install a plugin from a local directory into ~/.neurodock/plugins/<name>/",
    )
    .option("--yes", "skip the overwrite prompt; refuse without --force", false)
    .option(
      "--dry-run",
      "print what would happen without writing anything",
      false,
    )
    .option(
      "--force",
      "overwrite an existing install of the same plugin name",
      false,
    )
    .action(
      async (
        source: string,
        opts: { yes: boolean; dryRun: boolean; force: boolean },
      ) => {
        const r = await runPluginAdd({
          source,
          yes: opts.yes === true,
          dryRun: opts.dryRun === true,
          force: opts.force === true,
        });
        for (const m of r.messages) print(m);
        process.exit(r.exitCode);
      },
    );

  pluginCmd
    .command("remove <name>")
    .alias("uninstall")
    .description("remove an installed plugin from ~/.neurodock/plugins/")
    .option("--yes", "skip the confirmation prompt", false)
    .option(
      "--dry-run",
      "print what would happen without writing anything",
      false,
    )
    .action(async (name: string, opts: { yes: boolean; dryRun: boolean }) => {
      const r = await runPluginRemove({
        name,
        yes: opts.yes === true,
        dryRun: opts.dryRun === true,
      });
      for (const m of r.messages) print(m);
      process.exit(r.exitCode);
    });

  pluginCmd
    .command("list")
    .description(
      "list plugins installed under ~/.neurodock/plugins/ and their enabled state",
    )
    .option("--json", "print machine-readable output", false)
    .action(async (opts: { json: boolean }) => {
      const r = await runPluginList({ json: opts.json === true });
      for (const m of r.messages) print(m);
      process.exit(0);
    });

  pluginCmd
    .command("enable <name>")
    .description(
      "activate an installed plugin (writes a .enabled marker file the substrate reads)",
    )
    .action(async (name: string) => {
      const r = await runPluginEnable({ name });
      for (const m of r.messages) print(m);
      process.exit(r.exitCode);
    });

  pluginCmd
    .command("disable <name>")
    .description(
      "deactivate an installed plugin (removes the .enabled marker; keeps files)",
    )
    .action(async (name: string) => {
      const r = await runPluginDisable({ name });
      for (const m of r.messages) print(m);
      process.exit(r.exitCode);
    });

  pluginCmd
    .command("validate <source>")
    .description(
      "validate a plugin manifest without installing (checks plugin.yaml against plugin.schema.json)",
    )
    .option("--json", "print machine-readable output", false)
    .action(async (source: string, opts: { json: boolean }) => {
      const r = await runPluginValidate({
        source,
        json: opts.json === true,
      });
      for (const m of r.messages) print(m);
      process.exit(r.exitCode);
    });

  return program;
}

function validateClient(value: string): ClientId | "all" {
  if (
    value === "all" ||
    value === "claude-desktop" ||
    value === "claude-code" ||
    value === "cursor"
  ) {
    return value;
  }
  throw new Error(`Unknown --client value: ${value}`);
}

function validateProfile(value: string): "minimal" | "example" {
  if (value === "minimal" || value === "example") return value;
  throw new Error(`Unknown --profile value: ${value}`);
}

function validateInstaller(value: string): InstallerChoice {
  if (value === "uv" || value === "pip" || value === "auto") return value;
  throw new Error(`Unknown --installer value: ${value}`);
}

function print(line: string): void {
  process.stdout.write(`${line}\n`);
}

function formatCheck(c: CheckResult): string {
  const useColor = colorEnabled();
  const marker =
    c.status === "PASS"
      ? useColor
        ? chalk.green("PASS")
        : "PASS"
      : c.status === "FAIL"
        ? useColor
          ? chalk.red("FAIL")
          : "FAIL"
        : useColor
          ? chalk.yellow("SKIP")
          : "SKIP";
  const detail = c.detail ? ` — ${c.detail}` : "";
  return `  [${marker}] ${c.name}${detail}`;
}

const isMain =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("index.js") ||
    process.argv[1].endsWith("neurodock"));

if (isMain) {
  buildProgram()
    .parseAsync(process.argv)
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${message}\n`);
      process.exit(1);
    });
}
