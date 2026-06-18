#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 NeuroDock contributors.
/**
 * sync-skills.mjs
 *
 * Bundles the per-neurotype end-user skills from packages/skills/ into the
 * Claude Code plugin at claude-code/neurodock/skills/ so they actually reach
 * plugin / marketplace users.
 *
 * For every directory under packages/skills/ that contains a SKILL.md, this
 * copies that skill's content VERBATIM into claude-code/neurodock/skills/<name>/,
 * EXCLUDING:
 *   - the tests/ directory (CI-only; must not ship to users)
 *   - per-skill human docs: README.md and CHANGELOG.md (author-facing, they
 *     mirror the excluded top-level packages/skills/README.md and the plugin
 *     convention is SKILL.md-only)
 *
 * The top-level packages/skills/README.md is never copied (it is not a skill).
 *
 * Usage:
 *   node scripts/sync-skills.mjs           # write/refresh the plugin copies (idempotent)
 *   node scripts/sync-skills.mjs --check   # verify only; exit 1 if missing/differs (CI / drift guard)
 *
 * The drift-guard test (@neurodock/repo-tooling) asserts the same invariant so
 * the bundle can never silently fall out of sync.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Resolve the repo root. fileURLToPath handles every Windows URL form.
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

const SOURCE_DIR = path.join(REPO_ROOT, "packages", "skills");
const PLUGIN_DIR = path.join(REPO_ROOT, "claude-code", "neurodock", "skills");

const CHECK_MODE = process.argv.includes("--check");

// File / directory names that must NOT be bundled into the plugin.
const EXCLUDED_DIRS = new Set(["tests"]);
const EXCLUDED_FILES = new Set(["README.md", "CHANGELOG.md"]);

// ---- discovery --------------------------------------------------------------

/** Skill dirs = direct children of packages/skills/ that carry a SKILL.md. */
function discoverSkills() {
  let entries;
  try {
    entries = fs.readdirSync(SOURCE_DIR, { withFileTypes: true });
  } catch (err) {
    // Fail loudly if the source tree is missing/mis-named, rather than
    // reporting "0 skill(s) in sync" and exiting 0 (a false green).
    console.error(
      `[sync-skills] cannot read source directory ${SOURCE_DIR}: ${err.message}`,
    );
    process.exit(1);
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => fs.existsSync(path.join(SOURCE_DIR, name, "SKILL.md")))
    .sort();
}

/** Read a file's text, or null if absent — avoids a check-then-read race. */
function readIfExists(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

/** Files to bundle for a given skill (relative to the skill dir). */
function bundledFiles(skillName) {
  const skillRoot = path.join(SOURCE_DIR, skillName);
  const out = [];

  const walk = (absDir, relDir) => {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(path.join(absDir, entry.name), path.join(relDir, entry.name));
      } else if (entry.isFile()) {
        if (relDir === "" && EXCLUDED_FILES.has(entry.name)) continue;
        out.push(path.join(relDir, entry.name));
      }
    }
  };

  walk(skillRoot, "");
  return out.sort();
}

// ---- check mode -------------------------------------------------------------

function runCheck() {
  const skills = discoverSkills();
  const problems = [];

  for (const skill of skills) {
    for (const rel of bundledFiles(skill)) {
      const srcPath = path.join(SOURCE_DIR, skill, rel);
      const dstPath = path.join(PLUGIN_DIR, skill, rel);
      const relReport = path.join(skill, rel).replace(/\\/g, "/");

      const dst = readIfExists(dstPath);
      if (dst === null) {
        problems.push(`MISSING  ${relReport}`);
        continue;
      }
      const src = fs.readFileSync(srcPath, "utf8");
      if (src !== dst) {
        problems.push(`DIFFERS  ${relReport}`);
      }
    }
  }

  if (problems.length > 0) {
    console.error("[sync-skills] drift detected between packages/skills and");
    console.error("[sync-skills] claude-code/neurodock/skills:");
    for (const p of problems) console.error(`  ${p}`);
    console.error("");
    console.error("[sync-skills] run: node scripts/sync-skills.mjs");
    process.exit(1);
  }

  console.log(
    `[sync-skills] OK — ${skills.length} skill(s) in sync with the plugin.`,
  );
}

// ---- write mode -------------------------------------------------------------

function runSync() {
  const skills = discoverSkills();
  let copied = 0;
  let unchanged = 0;

  for (const skill of skills) {
    for (const rel of bundledFiles(skill)) {
      const srcPath = path.join(SOURCE_DIR, skill, rel);
      const dstPath = path.join(PLUGIN_DIR, skill, rel);
      const relReport = path.join(skill, rel).replace(/\\/g, "/");

      const src = fs.readFileSync(srcPath, "utf8");
      const current = readIfExists(dstPath);

      if (current === src) {
        unchanged++;
        continue;
      }

      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.writeFileSync(dstPath, src);
      copied++;
      console.log(
        `  ${current === null ? "+ added  " : "~ updated"} ${relReport}`,
      );
    }
  }

  console.log("");
  console.log(
    `[sync-skills] synced ${skills.length} skill(s): ${copied} written, ${unchanged} already current.`,
  );
}

// ---- main -------------------------------------------------------------------

if (CHECK_MODE) {
  runCheck();
} else {
  runSync();
}
