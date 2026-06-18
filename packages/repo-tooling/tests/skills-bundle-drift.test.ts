/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */

/**
 * Drift guard: every per-neurotype skill under packages/skills/ that carries a
 * SKILL.md MUST be bundled verbatim into the Claude Code plugin at
 * claude-code/neurodock/skills/<name>/SKILL.md.
 *
 * packages/skills is intentionally NOT a workspace package (no test runner of
 * its own), so this guard lives in the private @neurodock/repo-tooling package,
 * which `turbo run test` (and therefore the CI "TypeScript (lint, typecheck,
 * test, build)" job) executes.
 *
 * To make this pass, run: node scripts/sync-skills.mjs
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..", "..");
const SOURCE_DIR = join(REPO_ROOT, "packages", "skills");
const PLUGIN_DIR = join(REPO_ROOT, "claude-code", "neurodock", "skills");

/** Per-neurotype skills shipped from packages/skills (the launch set). */
const EXPECTED_SKILLS = [
  "adhd-daily-planner",
  "asd-meeting-translator",
  "audhd-context-recovery",
  "dyspraxia-task-pacer",
  "hyperfocus-formatter",
  "ocd-decision-finalizer",
  "visual-organizer",
] as const;

/** Source skill directories = any child of packages/skills with a SKILL.md. */
function discoverSourceSkills(): string[] {
  return readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => existsSync(join(SOURCE_DIR, name, "SKILL.md")))
    .sort();
}

describe("skills bundle drift guard", () => {
  it("discovers exactly the expected per-neurotype skills in packages/skills", () => {
    const discovered = discoverSourceSkills();
    expect(discovered).toEqual([...EXPECTED_SKILLS].sort());
  });

  it("bundles every source skill into the Claude Code plugin", () => {
    const missing = discoverSourceSkills().filter(
      (name) => !existsSync(join(PLUGIN_DIR, name, "SKILL.md")),
    );
    expect(missing).toEqual([]);
  });

  for (const name of EXPECTED_SKILLS) {
    it(`bundles ${name}/SKILL.md verbatim into the plugin`, () => {
      const sourcePath = join(SOURCE_DIR, name, "SKILL.md");
      const pluginPath = join(PLUGIN_DIR, name, "SKILL.md");

      expect(existsSync(sourcePath), `missing source ${sourcePath}`).toBe(true);
      expect(existsSync(pluginPath), `missing plugin copy ${pluginPath}`).toBe(
        true,
      );

      const source = readFileSync(sourcePath, "utf8");
      const plugin = readFileSync(pluginPath, "utf8");
      expect(plugin).toBe(source);
    });

    it(`${name}/SKILL.md has name + description frontmatter`, () => {
      const source = readFileSync(join(SOURCE_DIR, name, "SKILL.md"), "utf8");
      expect(source).toMatch(/^---\r?\n/);
      expect(source).toMatch(/\bname:\s*\S+/);
      expect(source).toMatch(/\bdescription:\s*\S+/);
    });
  }
});
