#!/usr/bin/env node
/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * End-to-end verification of the Phase 2 extension service-worker
 * watchdog. Exercises evaluateSignals + renderSignal against
 * hand-crafted history snapshots so we can prove the right signal
 * type fires under each documented condition. Pure imports — no
 * Chrome runtime, no setInterval, no IndexedDB.
 *
 * Run:
 *   pnpm --filter @neurodock/extension-browser exec node ../../scripts/verify-phase2-watchdog.mjs
 * or, from the repo root with tsx in PATH:
 *   node scripts/verify-phase2-watchdog.mjs
 *
 * The script invokes the package's bundled tsx so it can load the
 * .ts source directly.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const tsxBin = resolve(
  repoRoot,
  "packages",
  "extension-browser",
  "node_modules",
  ".bin",
  process.platform === "win32" ? "tsx.CMD" : "tsx",
);
const innerScript = resolve(__dirname, "verify-phase2-watchdog.inner.ts");

const proc = spawnSync(tsxBin, [innerScript], {
  cwd: resolve(repoRoot, "packages", "extension-browser"),
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(proc.status ?? 1);
