#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 NeuroDock contributors.
/**
 * add-license-headers.mjs
 *
 * Bulk-adds SPDX AGPL-3.0-or-later license headers to every source file in
 * the NeuroDock monorepo that doesn't already have one (audit finding M4).
 *
 * Usage:  node scripts/add-license-headers.mjs [--dry-run]
 *
 * Rules:
 *  - Skip files that already contain "SPDX-License-Identifier:" in the first 20 lines.
 *  - Skip generated / vendor / config / doc files (see SKIP_GLOBS).
 *  - Preserve shebangs: header goes below the shebang line.
 *  - TypeScript block comment  /* ... *\/  is used for .ts/.tsx/.mjs/.cjs/.js.
 *  - Python / shell comment  # ...  is used for .py/.sh.
 *  - CSS block comment  /* ... *\/  is used for .css.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")),
  "..",
);
const DRY_RUN = process.argv.includes("--dry-run");

// ---- header templates -------------------------------------------------------

const TS_HEADER = `/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
`;

const PY_HEADER = `# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
`;

const CSS_HEADER = `/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
`;

const SH_HEADER = `# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (c) 2026 NeuroDock contributors.
`;

function headerForExt(ext) {
  if ([".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx"].includes(ext))
    return TS_HEADER;
  if (ext === ".py") return PY_HEADER;
  if (ext === ".css") return CSS_HEADER;
  if (ext === ".sh") return SH_HEADER;
  return null;
}

// ---- directories to walk ----------------------------------------------------

const SOURCE_ROOTS = [
  "packages/extension-browser/src",
  "packages/extension-browser/entrypoints",
  "packages/extension-browser/scripts",
  "packages/cli/src",
  "packages/cli/scripts",
  "packages/core/src",
  "packages/native-host/src",
  "packages/mcp-cognitive-graph/src",
  "packages/mcp-cognitive-graph/tests",
  "packages/mcp-chronometric/src",
  "packages/mcp-chronometric/tests",
  "packages/mcp-task-fractionator/src",
  "packages/mcp-task-fractionator/tests",
  "packages/mcp-translation/src",
  "packages/mcp-translation/tests",
  "packages/mcp-guardrail/src",
  "packages/mcp-guardrail/tests",
  "packages/clinical/src",
  "packages/clinical/tests",
  "packages/evals/src",
  "packages/evals/tests",
  "scripts",
];

// Relative path segments that should always be skipped (checked against full path)
const SKIP_SEGMENTS = [
  "node_modules",
  ".venv",
  "dist",
  "build",
  ".output",
  ".turbo",
  ".astro",
  ".claude",
  ".claude-reports",
];

// Specific file names to always skip
const SKIP_FILENAMES = new Set([
  "compiled-validators.js",
  "compiled-validators.ts",
  "compiled-validators.d.ts",
]);

// Extensions we care about
const VALID_EXTS = new Set([
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".js",
  ".jsx",
  ".py",
  ".css",
  ".sh",
]);

// ---- helpers ----------------------------------------------------------------

function shouldSkipPath(relPath) {
  const parts = relPath.split(/[\\/]/);
  // Skip if any path segment is in our excluded list
  if (parts.some((p) => SKIP_SEGMENTS.includes(p))) return true;
  // Skip generated .d.ts files
  if (relPath.endsWith(".d.ts")) return true;
  // Skip specific filenames
  const basename = parts[parts.length - 1];
  if (SKIP_FILENAMES.has(basename)) return true;
  return false;
}

function alreadyHasHeader(content) {
  const first20Lines = content.split("\n").slice(0, 20).join("\n");
  return first20Lines.includes("SPDX-License-Identifier:");
}

function prependHeader(content, header) {
  // Preserve shebang: header goes after the first line
  if (content.startsWith("#!")) {
    const newlineIdx = content.indexOf("\n");
    if (newlineIdx === -1) {
      return content + "\n" + header;
    }
    const shebang = content.slice(0, newlineIdx + 1);
    const rest = content.slice(newlineIdx + 1);
    return shebang + header + rest;
  }
  return header + content;
}

function* walkDir(dirPath) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(REPO_ROOT, fullPath);
    if (shouldSkipPath(relPath)) continue;
    if (entry.isDirectory()) {
      yield* walkDir(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (VALID_EXTS.has(ext)) {
        yield fullPath;
      }
    }
  }
}

// ---- main -------------------------------------------------------------------

let totalScanned = 0;
let totalAdded = 0;
let totalSkipped = 0;

const packageCounts = {};

for (const sourceRoot of SOURCE_ROOTS) {
  const absRoot = path.join(REPO_ROOT, sourceRoot);
  if (!fs.existsSync(absRoot)) continue;

  for (const filePath of walkDir(absRoot)) {
    totalScanned++;

    const content = fs.readFileSync(filePath, "utf8");

    if (alreadyHasHeader(content)) {
      totalSkipped++;
      continue;
    }

    const ext = path.extname(filePath).toLowerCase();
    const header = headerForExt(ext);
    if (!header) {
      totalSkipped++;
      continue;
    }

    // Determine package bucket for reporting
    const relPath = path.relative(REPO_ROOT, filePath);
    const packageKey = relPath.split(/[\\/]/).slice(0, 2).join("/");
    packageCounts[packageKey] = (packageCounts[packageKey] ?? 0) + 1;

    if (!DRY_RUN) {
      const updated = prependHeader(content, header);
      fs.writeFileSync(filePath, updated, "utf8");
    }

    totalAdded++;
    console.log(`  + ${relPath}`);
  }
}

console.log("");
console.log("=== Results ===");
console.log(`Scanned:  ${totalScanned} files`);
console.log(`Added:    ${totalAdded} headers`);
console.log(`Skipped:  ${totalSkipped} (already present or unsupported ext)`);
console.log("");
console.log("Per-package breakdown:");
for (const [pkg, count] of Object.entries(packageCounts).sort()) {
  console.log(`  ${pkg}: ${count}`);
}

if (DRY_RUN) {
  console.log("");
  console.log("[DRY RUN — no files were modified]");
}
