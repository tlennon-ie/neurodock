#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { runProfileValidate, runProfileShow } from "./commands/profile.js";
import { colorEnabled } from "./lib/env.js";
import type { CheckResult, ClientId } from "./types.js";

export const CLI_VERSION = "0.1.0";

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
    .option("--client <id>", "claude-desktop | claude-code | cursor | all", "all")
    .option("--profile <id>", "minimal | example", "example")
    .option("--dry-run", "print the diff without writing anything", false)
    .option("--yes", "answer yes to all prompts (idempotent re-runs, collisions)", false)
    .action(async (opts: { client: string; profile: string; dryRun: boolean; yes: boolean }) => {
      const client = validateClient(opts.client);
      const profile = validateProfile(opts.profile);
      const result = await runInit({ client, profile, dryRun: opts.dryRun, yes: opts.yes });
      for (const m of result.messages) print(m);
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

  const profileCmd = program.command("profile").description("profile utilities");

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

  return program;
}

function validateClient(value: string): ClientId | "all" {
  if (value === "all" || value === "claude-desktop" || value === "claude-code" || value === "cursor") {
    return value;
  }
  throw new Error(`Unknown --client value: ${value}`);
}

function validateProfile(value: string): "minimal" | "example" {
  if (value === "minimal" || value === "example") return value;
  throw new Error(`Unknown --profile value: ${value}`);
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
  (process.argv[1].endsWith("index.js") || process.argv[1].endsWith("neurodock"));

if (isMain) {
  buildProgram().parseAsync(process.argv).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Error: ${message}\n`);
    process.exit(1);
  });
}
