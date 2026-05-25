#!/usr/bin/env node
/**
 * Release-gate verification — pulls a freshly-published npm tarball
 * from the registry, installs it in a scratch directory, and runs
 * `--version` against it. Exits non-zero if install or invocation
 * fails. Catches the 2026-05-24 "workspace: protocol leaked into
 * manifest" class of bug BEFORE @latest gets poisoned.
 *
 * Usage:
 *
 *   node scripts/verify-published-tarball.mjs @neurodock/cli 0.6.2
 *
 * Exit codes:
 *   0  install + invocation succeeded; reported version matched.
 *   1  install failed (workspace: protocol leak, missing dep, …).
 *   2  invocation succeeded but reported version mismatched.
 *   3  bad arguments.
 *
 * What this catches that a normal `pnpm test` does NOT:
 *
 *   - `workspace:` or `link:` prefixes leaking into the published
 *     dependencies block (npm/yarn can't resolve them).
 *   - Missing files that the `files` whitelist in package.json didn't
 *     ship (a verification using the in-repo source can't see this).
 *   - Hardcoded version strings inside the CLI drifting from the
 *     published version (e.g. CLI prints "0.5.0" but the manifest
 *     says "0.6.1").
 *   - Shebang missing from the bin entry on POSIX.
 *   - npx cache stale after a publish that hasn't propagated yet
 *     (we explicitly wait for `npm view <pkg>@<v>` to return).
 *
 * Wire into the release pipeline:
 *
 *   pnpm --filter @neurodock/cli build
 *   pnpm --filter @neurodock/cli publish
 *   node scripts/verify-published-tarball.mjs @neurodock/cli "$(node -p \"require('./packages/cli/package.json').version\")"
 *
 * The script always runs in a fresh temp dir so it cannot accidentally
 * pick up the in-repo source.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length < 2) {
  process.stderr.write(
    "usage: verify-published-tarball.mjs <package-name> <version>\n",
  );
  process.exit(3);
}
const [pkg, version] = args;

const POLL_INTERVAL_MS = 5_000;
const POLL_MAX_ATTEMPTS = 24; // up to 2 min for registry CDN propagation

function log(message) {
  process.stdout.write(`[verify] ${message}\n`);
}

function fatal(message, exitCode) {
  process.stderr.write(`[verify] FAIL: ${message}\n`);
  process.exit(exitCode);
}

function npmViewVersionAvailable() {
  const r = spawnSync("npm", ["view", `${pkg}@${version}`, "version"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) return false;
  return r.stdout.trim() === version;
}

log(`Waiting for ${pkg}@${version} to appear on the registry…`);
let visible = false;
for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt += 1) {
  if (npmViewVersionAvailable()) {
    visible = true;
    log(`  visible after ${attempt} attempt(s).`);
    break;
  }
  const wait = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(wait, 0, 0, POLL_INTERVAL_MS);
}
if (!visible) {
  fatal(
    `${pkg}@${version} did not appear on the registry within ${
      (POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS) / 1000
    }s.`,
    1,
  );
}

const tmp = mkdtempSync(join(tmpdir(), "verify-tarball-"));
log(`Scratch dir: ${tmp}`);
try {
  log(`Running: npx --yes ${pkg}@${version} --version`);
  const r = spawnSync("npx", ["--yes", `${pkg}@${version}`, "--version"], {
    cwd: tmp,
    encoding: "utf8",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      // Force npx to skip its existing cache and resolve fresh.
      npm_config_prefer_online: "true",
    },
  });
  if (r.status !== 0) {
    fatal(
      `npx install/invocation failed (exit ${r.status}):\n${r.stderr.trim()}`,
      1,
    );
  }
  const reported = r.stdout.trim();
  if (reported !== version) {
    fatal(
      `version mismatch — registry says ${version}, --version printed "${reported}".`,
      2,
    );
  }
  log(
    `PASS — ${pkg}@${version} installs cleanly and reports the right version.`,
  );
} finally {
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    // best effort
  }
}
