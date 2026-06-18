#!/usr/bin/env node
/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Copy non-TS assets from `src/assets/`, `packages/core/schemas/`, and the
 * per-neurotype skills from `packages/skills/` into `dist/assets/` after tsc.
 *
 * tsc only emits the .ts -> .js transformation; the bundled Python hook
 * script, profile templates, JSON schemas, and skill markdown need to be
 * copied separately so the published npm package contains them. Without the
 * schemas, `init`, profile validation, and plugin validation all fail on a
 * fresh `npx` install because the resolver paths point at the workspace
 * `core` package which is not part of the cli tarball. Likewise, without the
 * skills, `neurodock install-skills` has nothing to copy.
 *
 * The skills copy is GENERATED here at build time (the destination lives
 * under `dist/`, which is gitignored) so there is no committed third copy of
 * the skill content to drift. `packages/skills/` stays the single source of
 * truth, the Claude Code plugin copy is produced by `scripts/sync-skills.mjs`
 * (+ its drift guard), and this build step produces the CLI tarball copy.
 *
 * Idempotent — runs after every build, overwrites destination.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const cliRoot = resolve(here, "..");
const distAssets = resolve(cliRoot, "dist", "assets");

const srcAssets = resolve(cliRoot, "src", "assets");
if (existsSync(srcAssets)) {
  mkdirSync(distAssets, { recursive: true });
  cpSync(srcAssets, distAssets, { recursive: true });
  process.stdout.write(`[copy-assets] copied ${srcAssets} -> ${distAssets}\n`);
} else {
  process.stderr.write(`[copy-assets] no src dir at ${srcAssets}, skipping\n`);
}

const coreSchemas = resolve(cliRoot, "..", "core", "schemas");
const distSchemas = resolve(distAssets, "schemas");
if (existsSync(coreSchemas)) {
  mkdirSync(distSchemas, { recursive: true });
  cpSync(coreSchemas, distSchemas, { recursive: true });
  process.stdout.write(
    `[copy-assets] copied ${coreSchemas} -> ${distSchemas}\n`,
  );
} else {
  process.stderr.write(
    `[copy-assets] no core schemas at ${coreSchemas}, skipping (init/validate will fail in a published tarball)\n`,
  );
}

// --- skills (packages/skills/<name>/SKILL.md -> dist/assets/skills/) --------
// Copy SKILL.md ONLY. Exclude tests/ (CI-only) and the author-facing
// README.md / CHANGELOG.md, mirroring scripts/sync-skills.mjs so the CLI
// tarball ships the same content the plugin does. Read-and-catch (no
// existsSync-then-read) avoids a TOCTOU window.
const skillsSource = resolve(cliRoot, "..", "skills");
const distSkills = resolve(distAssets, "skills");

function readSkillDirs(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return null;
  }
}

const skillDirs = readSkillDirs(skillsSource);
if (skillDirs === null) {
  process.stderr.write(
    `[copy-assets] no skills source at ${skillsSource}, skipping (install-skills will be empty in a published tarball)\n`,
  );
} else {
  let copied = 0;
  for (const name of skillDirs) {
    const srcMd = join(skillsSource, name, "SKILL.md");
    let content;
    try {
      content = readFileSync(srcMd, "utf8");
    } catch {
      // Not a skill (no SKILL.md) — skip silently.
      continue;
    }
    const dstDir = join(distSkills, name);
    mkdirSync(dstDir, { recursive: true });
    writeFileSync(join(dstDir, "SKILL.md"), content);
    copied += 1;
  }
  process.stdout.write(
    `[copy-assets] bundled ${copied} skill(s) ${skillsSource} -> ${distSkills}\n`,
  );
}
