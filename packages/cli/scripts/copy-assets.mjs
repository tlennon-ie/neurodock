#!/usr/bin/env node
/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Copy non-TS assets from `src/assets/` into `dist/assets/` after tsc.
 *
 * tsc only emits the .ts -> .js transformation; the bundled Python hook
 * script and other static assets need to be copied separately so the
 * published npm package contains them.
 *
 * Idempotent — runs after every build, overwrites destination.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, "..", "src", "assets");
const dst = resolve(here, "..", "dist", "assets");

if (!existsSync(src)) {
  process.stderr.write(`[copy-assets] no src dir at ${src}, skipping\n`);
  process.exit(0);
}

mkdirSync(dirname(dst), { recursive: true });
cpSync(src, dst, { recursive: true });
process.stdout.write(`[copy-assets] copied ${src} -> ${dst}\n`);
