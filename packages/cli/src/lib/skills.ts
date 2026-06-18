/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Skills-delivery helpers for `neurodock install-skills`.
 *
 * Two concerns live here, kept separate from the command body so they can
 * be unit-tested and reused:
 *
 *   1. Locating the *bundled* skills inside the @neurodock/cli package
 *      (shipped to `dist/assets/skills/<name>/SKILL.md` by
 *      `scripts/copy-assets.mjs`, with dev/workspace fall-backs).
 *   2. Resolving each MCP client's *personal skills directory* on disk.
 *
 * The personal-skills directory is the same for Claude Code and Claude
 * Desktop — both read `~/.claude/skills/<name>/SKILL.md`. Cursor has no
 * skills system, so it has no target (the caller skips it).
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientId } from "../types.js";
import { type EnvSnapshot, readEnv } from "./env.js";

/** A single bundled skill discovered in the CLI package. */
export interface BundledSkill {
  /** Source skill directory name, e.g. `adhd-daily-planner`. */
  readonly name: string;
  /** Absolute path to the skill's `SKILL.md`. */
  readonly skillMd: string;
}

/**
 * The personal-skills directory Claude Code AND Claude Desktop both read.
 * Returns `null` for clients without a skills system (Cursor).
 */
export function clientSkillsDir(
  client: ClientId,
  env: EnvSnapshot = readEnv(),
): string | null {
  switch (client) {
    case "claude-code":
    case "claude-desktop":
      // Both desktop and code discover *personal* skills from ~/.claude/skills.
      return join(env.home, ".claude", "skills");
    case "cursor":
      // Cursor has no skills system today.
      return null;
    default:
      return null;
  }
}

/**
 * Namespace an installed skill so it is collision-free and recognisably
 * NeuroDock's: `<dir>/neurodock-<name>/`.
 */
export function namespacedSkillDir(skillsDir: string, name: string): string {
  return join(skillsDir, `neurodock-${name}`);
}

/**
 * Candidate locations for the bundled skills, in precedence order:
 *
 *   1. Published tarball: `dist/assets/skills/` (copy-assets.mjs target).
 *      From `dist/commands/install-skills.js` that is `../assets/skills`.
 *   2. Dev/workspace: the monorepo's `packages/skills/` source of truth,
 *      so the command works under `tsx`/vitest without a prior build.
 */
export function bundledSkillsCandidates(
  moduleUrl: string,
  env: EnvSnapshot = readEnv(),
): ReadonlyArray<string> {
  // `here` is the calling module's dir: src/commands (tsx/vitest) or
  // dist/commands (published). The candidates below cover both.
  const here = dirname(fileURLToPath(moduleUrl));
  return [
    // Published tarball: dist/commands -> dist/assets/skills.
    resolve(here, "..", "assets", "skills"),
    // Monorepo dev: dist|src/commands -> packages/skills (up three levels).
    resolve(here, "..", "..", "..", "skills"),
    // Monorepo dev, one level deeper (defensive against nested build output).
    resolve(here, "..", "..", "..", "..", "skills"),
    join(env.cwd, "packages", "skills"),
  ];
}

/** Names of files that must never ship as part of an installed skill. */
const EXCLUDED_TOP_LEVEL_FILES = new Set(["README.md", "CHANGELOG.md"]);

/**
 * Enumerate bundled skills under `sourceDir`. A skill is any direct child
 * directory that contains a readable `SKILL.md`. Returns an empty array if
 * `sourceDir` is missing/unreadable (the caller treats that as a packaging
 * bug).
 *
 * Read-and-catch throughout — no `existsSync`-then-read TOCTOU windows.
 */
export function discoverBundledSkills(
  sourceDir: string,
): ReadonlyArray<BundledSkill> {
  let entries: ReadonlyArray<{ name: string; isDirectory: () => boolean }>;
  try {
    entries = readdirSync(sourceDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: BundledSkill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (EXCLUDED_TOP_LEVEL_FILES.has(entry.name)) continue;
    const skillMd = join(sourceDir, entry.name, "SKILL.md");
    if (readIfExists(skillMd) === null) continue;
    skills.push({ name: entry.name, skillMd });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Read a file's text, or null if absent — avoids a check-then-read race. */
export function readIfExists(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch (err: unknown) {
    if (
      typeof err === "object" &&
      err !== null &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }
}
