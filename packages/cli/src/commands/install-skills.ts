/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * `neurodock install-skills` — copy the bundled per-neurotype skills into
 * the user's client personal-skills directory so Claude Code / Claude
 * Desktop discover them.
 *
 * Why this exists:
 *
 *   Marketplace/plugin users already get the skills bundled into the
 *   Claude Code plugin (see `scripts/sync-skills.mjs`). Users who install
 *   via `@neurodock/cli` only got the MCP servers wired — no skills. This
 *   command closes that gap by copying the skills the CLI tarball ships
 *   (under `dist/assets/skills/`) into `~/.claude/skills/neurodock-<name>/`.
 *
 * Target directories:
 *
 *   - Claude Code   -> ~/.claude/skills/   (personal skills)
 *   - Claude Desktop -> ~/.claude/skills/  (same personal-skills dir)
 *   - Cursor        -> skipped (no skills system today)
 *
 * Idempotent: re-running overwrites/refreshes each `SKILL.md` atomically.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteOverwrite } from "../util/atomic-write.js";
import { readEnv, type EnvSnapshot } from "../lib/env.js";
import {
  bundledSkillsCandidates,
  clientSkillsDir,
  discoverBundledSkills,
  namespacedSkillDir,
  readIfExists,
  type BundledSkill,
} from "../lib/skills.js";
import type { ClientId } from "../types.js";

export interface InstallSkillsOptions {
  /** Which client's personal-skills dir to target, or `all`. */
  readonly client: ClientId | "all";
  readonly dryRun: boolean;
  readonly yes: boolean;
}

export interface InstallSkillsDependencies {
  /** Override the environment snapshot (for tests). */
  readonly envOverrides?: Parameters<typeof readEnv>[0];
  /**
   * Override where the bundled skills live. Defaults to the first existing
   * candidate from `bundledSkillsCandidates`. Tests inject a fake source.
   */
  readonly skillsSourceDir?: string;
}

export interface InstallSkillsResult {
  readonly messages: ReadonlyArray<string>;
  /** Number of (skill x client-target) copies written. */
  readonly installed: number;
  /** 0 = ok, 1 = no bundled skills found (packaging bug). */
  readonly exitCode: 0 | 1;
}

/** Clients that have a personal-skills directory we can write to. */
const SKILLS_CAPABLE: ReadonlyArray<ClientId> = [
  "claude-code",
  "claude-desktop",
];

const SKILLS_INCAPABLE: ReadonlyArray<ClientId> = ["cursor"];

export async function runInstallSkills(
  options: InstallSkillsOptions,
  deps: InstallSkillsDependencies = {},
): Promise<InstallSkillsResult> {
  const env = readEnv(deps.envOverrides ?? {});
  const messages: string[] = [];

  // 1. Locate the bundled skills.
  const sourceDir = resolveSkillsSource(deps, env);
  const skills = discoverBundledSkills(sourceDir);
  if (skills.length === 0) {
    messages.push("[install-skills] could not find any bundled skills.");
    messages.push(
      "  This is a packaging bug — the skills should ship with @neurodock/cli " +
        "(under dist/assets/skills/). Re-install the CLI or run a fresh build.",
    );
    return { messages, installed: 0, exitCode: 1 };
  }

  // 2. Resolve which client target dirs to write to. We do NOT gate on the
  //    client config existing: skills live in ~/.claude/skills regardless of
  //    whether the MCP config file is present, and the dir is shared anyway.
  const targets = resolveTargets(options.client);

  // 3. Skipped clients (e.g. Cursor) — clear notice, never an error.
  const skipped = resolveSkipped(options.client);
  for (const s of skipped) {
    messages.push(
      `Skipping ${s}: it has no skills system, so there is nowhere to install skills.`,
    );
  }

  if (targets.length === 0) {
    messages.push("No skills-capable client selected. Nothing to install.");
    messages.push(
      "Skills install into Claude Code / Claude Desktop's ~/.claude/skills directory.",
    );
    return { messages, installed: 0, exitCode: 0 };
  }

  // The personal-skills dir is shared between Claude Code and Claude Desktop,
  // so de-duplicate the resolved paths to avoid copying the same files twice.
  const skillsDirs = uniqueSkillsDirs(targets, env);

  if (options.dryRun) {
    messages.push("Dry run. No skills written.");
    messages.push(
      `Would install ${skills.length} skill(s) into ${skillsDirs.length} location(s):`,
    );
    for (const dir of skillsDirs) {
      messages.push(`  ${dir}`);
      for (const skill of skills) {
        messages.push(`    + ${join(`neurodock-${skill.name}`, "SKILL.md")}`);
      }
    }
    return { messages, installed: 0, exitCode: 0 };
  }

  // 4. Install.
  let installed = 0;
  messages.push(
    `Installing ${skills.length} NeuroDock skill(s) into ${skillsDirs.length} location(s)...`,
  );
  for (const dir of skillsDirs) {
    messages.push(`  ${dir}`);
    for (const skill of skills) {
      const line = installSkill(skill, dir);
      messages.push(`    ${line.text}`);
      if (line.ok) installed += 1;
    }
  }

  messages.push("");
  messages.push(
    `Summary: installed ${installed} of ${
      skills.length * skillsDirs.length
    } skill copy(ies) across ${skillsDirs.length} location(s).`,
  );
  messages.push(
    "Restart Claude Code / Claude Desktop so it discovers the new skills.",
  );

  return { messages, installed, exitCode: 0 };
}

interface InstallLine {
  readonly ok: boolean;
  readonly text: string;
}

function installSkill(skill: BundledSkill, skillsDir: string): InstallLine {
  // Read-and-catch (no existsSync-then-read): the source SKILL.md was
  // confirmed readable during discovery, but re-read defensively.
  const content = readIfExists(skill.skillMd);
  if (content === null) {
    return {
      ok: false,
      text: `[skip] neurodock-${skill.name} — source SKILL.md disappeared`,
    };
  }
  const destDir = namespacedSkillDir(skillsDir, skill.name);
  const destFile = join(destDir, "SKILL.md");
  try {
    mkdirSync(destDir, { recursive: true });
    atomicWriteOverwrite(destFile, content);
    return { ok: true, text: `[ok]   neurodock-${skill.name}` };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      text: `[fail] neurodock-${skill.name} — ${truncate(detail)}`,
    };
  }
}

function resolveSkillsSource(
  deps: InstallSkillsDependencies,
  env: EnvSnapshot,
): string {
  if (deps.skillsSourceDir !== undefined) return deps.skillsSourceDir;
  // Pick the first candidate that actually contains a skill. We probe by
  // discovery rather than existsSync to avoid a TOCTOU window.
  for (const candidate of bundledSkillsCandidates(import.meta.url, env)) {
    if (discoverBundledSkills(candidate).length > 0) return candidate;
  }
  // Fall back to the first candidate; discovery there will return [] and the
  // caller reports the packaging-bug message.
  return bundledSkillsCandidates(import.meta.url, env)[0] ?? "";
}

function resolveTargets(client: ClientId | "all"): ReadonlyArray<ClientId> {
  if (client === "all") return SKILLS_CAPABLE;
  if (SKILLS_CAPABLE.includes(client)) return [client];
  return [];
}

function resolveSkipped(client: ClientId | "all"): ReadonlyArray<ClientId> {
  if (client === "all") return SKILLS_INCAPABLE;
  if (SKILLS_INCAPABLE.includes(client)) return [client];
  return [];
}

function uniqueSkillsDirs(
  clients: ReadonlyArray<ClientId>,
  env: EnvSnapshot,
): ReadonlyArray<string> {
  const seen = new Set<string>();
  const dirs: string[] = [];
  for (const client of clients) {
    const dir = clientSkillsDir(client, env);
    if (dir === null) continue;
    if (seen.has(dir)) continue;
    seen.add(dir);
    dirs.push(dir);
  }
  return dirs;
}

function truncate(s: string, max = 120): string {
  const first = s.split("\n")[0] ?? "";
  return first.length > max ? `${first.slice(0, max - 1)}…` : first;
}
