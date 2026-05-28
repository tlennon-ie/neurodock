#!/usr/bin/env node
/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Copy non-TS assets from `src/assets/` and `packages/core/schemas/` into
 * `dist/assets/` after tsc.
 *
 * tsc only emits the .ts -> .js transformation; the bundled Python hook
 * script, profile templates, and JSON schemas need to be copied separately
 * so the published npm package contains them. Without the schemas, `init`,
 * profile validation, and plugin validation all fail on a fresh `npx`
 * install because the resolver paths point at the workspace `core` package
 * which is not part of the cli tarball.
 *
 * Idempotent — runs after every build, overwrites destination.
 */
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
