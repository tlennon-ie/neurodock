/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * Bundle the host bin (`src/cli.ts`) into a single self-contained
 * `dist/cli.js` with its runtime deps (ajv, ajv-formats, yaml) inlined.
 *
 * Why: the installer STAGES this file into a stable per-user directory and
 * points the native-messaging manifest's launcher at it (see
 * src/registration/staging.ts). Once relocated out of npm's `_npx` cache the
 * file must resolve ZERO bare imports — npm prunes the cache, and a published
 * install flattens deps into a shared node_modules the staged copy can't see.
 * A bundle is the only artifact that is reliably relocatable across npm and
 * pnpm layouts, so the staged host is truly self-contained.
 *
 * tsc still emits the per-module `dist/**` (the programmatic API the CLI
 * imports with its OWN node_modules); this step overwrites only `dist/cli.js`
 * with the bundle.
 */
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");

// Bake the package version into the bundle. The staged copy Chrome launches
// has no real package.json to read at runtime (staging drops only a
// `{"type":"module"}` shim), so protocol.ts reads this define instead. See
// resolveHostVersion() in src/protocol.ts.
const { version } = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf8"),
);

await build({
  entryPoints: [resolve(packageRoot, "src", "cli.ts")],
  outfile: resolve(packageRoot, "dist", "cli.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  // platform:node keeps node: builtins external; everything else (ajv / yaml
  // / the host's own modules) is inlined into the single output file.
  //
  // ajv and yaml are CommonJS. esbuild's ESM output replaces their internal
  // `require(...)` with a shim that throws "Dynamic require ... not supported"
  // unless a real `require` exists. Re-create one from import.meta.url so the
  // inlined CJS deps load their node: builtins (process, util, ...) at runtime.
  //
  // No shebang banner: the launcher invokes `node cli.js run` explicitly, and
  // a `#!` line would be a syntax error if the staged copy is ever loaded as
  // CommonJS. The bundle stays ESM; staging drops a `{"type":"module"}`
  // package.json next to it so node treats the relocated `.js` as ESM even
  // outside the package (where `.js` would otherwise default to CommonJS).
  banner: {
    js: [
      'import { createRequire as __nd_createRequire } from "node:module";',
      "const require = __nd_createRequire(import.meta.url);",
    ].join("\n"),
  },
  define: {
    __NEURODOCK_HOST_VERSION__: JSON.stringify(version),
  },
  logLevel: "info",
});
