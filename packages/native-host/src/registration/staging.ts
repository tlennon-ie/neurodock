/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Stage the native-host runtime into a STABLE per-user directory and write a
 * launcher Chrome can actually execute.
 *
 * Why this exists (three shipped defects this module fixes):
 *
 *   1. Pointing a native-messaging manifest's `path` at
 *      `@neurodock/native-host/dist/cli.js` resolved relative to a `npx`
 *      invocation lands inside npm's `_npx` cache, which npm prunes/rotates.
 *      The manifest then points at a deleted file. We copy `dist/**` (pure
 *      Node, zero runtime deps) into a stable location at install time.
 *
 *   2. Chrome on Windows cannot launch a bare `.js` as a native-messaging
 *      host (it fails CreateProcess or runs under Windows Script Host, not
 *      Node). We write a `.bat` (Windows) / `#!/bin/sh` wrapper (macOS,
 *      Linux) that invokes the absolute node binary with the staged cli.js.
 *
 *   3. Chrome launches the host with the calling extension's origin as the
 *      first CLI arg, which the old `parseArgs` treated as "print help". The
 *      launcher forces the literal `run` subcommand BEFORE forwarding
 *      Chrome's args, so the origin lands harmlessly after `run`.
 *
 * Everything here is OS-parameterised (`platform`, `home`, `env`, `nodePath`,
 * `sourceDistDir` are all injected) so the per-OS artifacts are unit-testable
 * on Linux CI without the actual OS.
 */
import {
  cpSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  realpathSync,
  existsSync,
  rmSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HOST_NAME } from "./types.js";

export type StagingPlatform = "darwin" | "linux" | "win32";

// A double-quote closes the quoted "<path>" in the launcher; any C0 control
// char (incl. CR / LF / NUL) could splice an extra launcher line. Defined as a
// constructed RegExp so the source file stays free of literal control bytes.
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_CHARS = new RegExp('["\\u0000-\\u001f]');

/**
 * Reject a runtime directory that could not be embedded safely inside a
 * quoted launcher path. A double-quote, newline, or other control char in the
 * resolved dir — which could arrive via a hostile `XDG_DATA_HOME` / `APPDATA`
 * — would break out of the quoted `"<path>"` in the `.sh` / `.bat` launcher
 * (shell injection / a broken launcher). The legitimate per-user data roots
 * never contain these, so failing fast is safe and cheap.
 */
function assertSafeRuntimeDir(dir: string): void {
  if (UNSAFE_PATH_CHARS.test(dir)) {
    throw new Error(
      "Refusing to stage the native host: the resolved runtime directory " +
        "contains an unsafe character (a double-quote or control character). " +
        "Check your APPDATA / XDG_DATA_HOME environment.",
    );
  }
}

/**
 * The stable, per-user directory the runtime is staged into. Lives next to
 * (or under) the same NeuroDock data root the per-OS registration already
 * uses, so uninstall can find and remove it.
 *
 *   Windows: %APPDATA%\NeuroDock\native-host\runtime\
 *   macOS:   ~/Library/Application Support/NeuroDock/native-host/runtime/
 *   Linux:   $XDG_DATA_HOME/neurodock/native-host/runtime/
 *            (fallback ~/.local/share/neurodock/native-host/runtime/)
 */
export function stableRuntimeDir(
  platform: StagingPlatform,
  home: string,
  env: NodeJS.ProcessEnv,
): string {
  if (platform === "win32") {
    const appdata = env["APPDATA"];
    const root =
      appdata && appdata.trim().length > 0
        ? appdata
        : join(home, "AppData", "Roaming");
    return join(root, "NeuroDock", "native-host", "runtime");
  }
  if (platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "NeuroDock",
      "native-host",
      "runtime",
    );
  }
  // linux
  const xdgData = env["XDG_DATA_HOME"];
  const dataRoot =
    xdgData && xdgData.trim().length > 0
      ? xdgData
      : join(home, ".local", "share");
  return join(dataRoot, "neurodock", "native-host", "runtime");
}

/**
 * Absolute path to the Chromium (Chrome/Chromium/Brave/Edge/Vivaldi) native
 * messaging host manifest that the per-OS registration writes. This is the
 * file `neurodock doctor` reads to discover the ALREADY-INSTALLED launcher —
 * verify must reflect the real on-disk install, never re-stage.
 *
 *   Windows: %APPDATA%\NeuroDock\native-host\com.neurodock.profile.json
 *            (a single manifest file the HKCU registry pointers reference)
 *   macOS:   ~/Library/Application Support/Google/Chrome/NativeMessagingHosts/
 *            com.neurodock.profile.json
 *   Linux:   $XDG_CONFIG_HOME/google-chrome/NativeMessagingHosts/
 *            com.neurodock.profile.json (fallback ~/.config)
 *
 * Chrome is the canonical reference manifest; on macOS/Linux the other
 * Chromium browsers each get their own copy with an identical `path`, so any
 * one of them resolves the same launcher. We read Chrome's.
 */
export function chromiumManifestPath(
  platform: StagingPlatform,
  home: string,
  env: NodeJS.ProcessEnv,
): string {
  if (platform === "win32") {
    const appdata = env["APPDATA"];
    const root =
      appdata && appdata.trim().length > 0
        ? appdata
        : join(home, "AppData", "Roaming");
    return join(root, "NeuroDock", "native-host", `${HOST_NAME}.json`);
  }
  if (platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "Google",
      "Chrome",
      "NativeMessagingHosts",
      `${HOST_NAME}.json`,
    );
  }
  // linux
  const xdg = env["XDG_CONFIG_HOME"];
  const cfg = xdg && xdg.trim().length > 0 ? xdg : join(home, ".config");
  return join(
    cfg,
    "google-chrome",
    "NativeMessagingHosts",
    `${HOST_NAME}.json`,
  );
}

export interface InstalledLauncher {
  readonly ok: boolean;
  /** The `path` the on-disk manifest points at (empty when unreadable). */
  readonly launcherPath: string;
  /** The manifest file that was read. */
  readonly manifestPath: string;
  /** Why resolution failed (absent on success). */
  readonly detail?: string;
}

/**
 * Resolve the launcher of the ALREADY-INSTALLED host by reading the on-disk
 * Chromium manifest and returning its `path` — without staging or registering
 * anything. This is what `neurodock doctor` spawns, so the diagnostic
 * reflects the user's real install: a manifest that points at a pruned old
 * `_npx` cache cli.js, or a missing manifest, FAILS rather than being silently
 * repaired.
 */
export function resolveInstalledLauncher(
  platform: StagingPlatform,
  home: string,
  env: NodeJS.ProcessEnv,
): InstalledLauncher {
  const manifestPath = chromiumManifestPath(platform, home, env);
  if (!existsSync(manifestPath)) {
    return {
      ok: false,
      launcherPath: "",
      manifestPath,
      detail:
        `native host not installed (no manifest at ${manifestPath}) — ` +
        "run 'neurodock host install'.",
    };
  }
  let parsed: { path?: unknown };
  try {
    parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      path?: unknown;
    };
  } catch (err) {
    return {
      ok: false,
      launcherPath: "",
      manifestPath,
      detail:
        `native host manifest at ${manifestPath} is unreadable ` +
        `(${err instanceof Error ? err.message : String(err)}) — ` +
        "re-run 'neurodock host install'.",
    };
  }
  const launcherPath = typeof parsed.path === "string" ? parsed.path : "";
  if (launcherPath.length === 0) {
    return {
      ok: false,
      launcherPath: "",
      manifestPath,
      detail:
        `native host manifest at ${manifestPath} has no usable 'path' — ` +
        "re-run 'neurodock host install'.",
    };
  }
  if (!existsSync(launcherPath)) {
    return {
      ok: false,
      launcherPath,
      manifestPath,
      detail:
        `native host launcher is missing at ${launcherPath} ` +
        "(the manifest points at a path that no longer exists) — " +
        "re-run 'neurodock host install'.",
    };
  }
  return { ok: true, launcherPath, manifestPath };
}

/**
 * Read the installed Chromium manifest's `allowed_origins` and return any
 * entries Chrome would reject — i.e. not of the exact form
 * `chrome-extension://<32 chars a-p>/`. Chrome refuses the ENTIRE manifest if a
 * single entry is malformed (reporting "Specified native messaging host not
 * found"), so `neurodock doctor` surfaces these instead of giving a false PASS
 * from a successful direct launcher spawn. Returns [] when the manifest is
 * absent or unreadable (the launcher check reports those separately).
 */
export function findInvalidChromiumOrigins(
  platform: StagingPlatform,
  home: string,
  env: NodeJS.ProcessEnv,
): string[] {
  const manifestPath = chromiumManifestPath(platform, home, env);
  // Read-and-catch rather than existsSync/statSync-then-read: a missing or
  // unreadable manifest yields [] (the launcher check reports absence). This
  // avoids a check-then-read TOCTOU (CodeQL js/file-system-race).
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    return [];
  }
  // Sanity bail on an implausibly large file (the manifest is tens of bytes).
  if (raw.length > 65536) return [];
  let parsed: { allowed_origins?: unknown };
  try {
    parsed = JSON.parse(raw) as { allowed_origins?: unknown };
  } catch {
    return [];
  }
  const origins = Array.isArray(parsed.allowed_origins)
    ? parsed.allowed_origins
    : [];
  const VALID_ORIGIN = /^chrome-extension:\/\/[a-p]{32}\/$/;
  // A non-string entry, or a string that is not a well-formed chrome-extension
  // origin, both make Chrome reject the whole manifest — report either.
  return origins
    .filter((o) => typeof o !== "string" || !VALID_ORIGIN.test(o))
    .map((o) => (typeof o === "string" ? o : JSON.stringify(o)));
}

/** Launcher file name per OS: a `.bat` on Windows, a `.sh` elsewhere. */
export function launcherFileName(platform: StagingPlatform): string {
  return platform === "win32" ? `${HOST_NAME}.bat` : `${HOST_NAME}.sh`;
}

/**
 * The exact content of the launcher script. The launcher embeds the absolute
 * node binary (so Chrome's launch environment need not have `node` on PATH)
 * and forces the `run` subcommand before forwarding Chrome's args.
 */
export function buildLauncherContent(
  platform: StagingPlatform,
  nodePath: string,
  stagedCliPath: string,
): string {
  if (platform === "win32") {
    // CRLF line endings; quote both paths; `run` before `%*` so Chrome's
    // origin arg (and `--parent-window=`) arrive after the subcommand.
    return "@echo off\r\n" + `"${nodePath}" "${stagedCliPath}" run %*\r\n`;
  }
  // POSIX shell wrapper. `exec` replaces the shell so the stdio pipes Chrome
  // opened are inherited directly by node. `run` precedes "$@".
  return `#!/bin/sh\nexec "${nodePath}" "${stagedCliPath}" run "$@"\n`;
}

export interface StageRuntimeOptions {
  readonly platform: StagingPlatform;
  readonly home: string;
  readonly env: NodeJS.ProcessEnv;
  /** The native-host `dist/` directory to copy from. */
  readonly sourceDistDir: string;
  /** Absolute path to the node binary to embed in the launcher. */
  readonly nodePath: string;
}

export interface StageRuntimeResult {
  /** The stable directory the dist tree was copied into. */
  readonly runtimeDir: string;
  /** Absolute path to the staged cli.js the launcher invokes. */
  readonly stagedCliPath: string;
  /** Absolute path to the launcher the manifest should point at. */
  readonly launcherPath: string;
}

/**
 * Copy the source `dist/**` into the stable runtime dir (idempotent — a
 * re-install overwrites), then write the launcher and return its path. The
 * returned `launcherPath` is what the manifest `path` should be set to.
 */
export function stageRuntime(opts: StageRuntimeOptions): StageRuntimeResult {
  const runtimeDir = stableRuntimeDir(opts.platform, opts.home, opts.env);
  // Guard before we write a launcher whose body embeds the dir inside quotes:
  // an unsafe char here would produce a broken / injectable launcher.
  assertSafeRuntimeDir(runtimeDir);
  mkdirSync(runtimeDir, { recursive: true });

  // Overwrite-copy the entire dist tree. cpSync with recursive+force makes
  // the operation idempotent across re-installs. The dist is a self-contained
  // bundle (cli.js inlines ajv / ajv-formats / yaml — see build:bundle), so
  // the relocated host resolves zero bare imports and survives npm pruning
  // the `_npx` cache without staging any node_modules.
  cpSync(opts.sourceDistDir, runtimeDir, { recursive: true, force: true });

  // The bundled cli.js is ESM. Outside the package (the staged copy has no
  // ancestor package.json) node treats a bare `.js` as CommonJS, which would
  // fail to parse the ESM bundle. Drop a minimal module manifest so the
  // relocated file is loaded as ESM.
  writeFileSync(
    join(runtimeDir, "package.json"),
    JSON.stringify({ type: "module" }, null, 2) + "\n",
  );

  const stagedCliPath = join(runtimeDir, "cli.js");
  const launcherPath = join(runtimeDir, launcherFileName(opts.platform));
  const content = buildLauncherContent(
    opts.platform,
    opts.nodePath,
    stagedCliPath,
  );
  // 0o755 so the unix wrapper is executable. Windows ignores the mode bits.
  writeFileSync(launcherPath, content, { mode: 0o755 });

  return { runtimeDir, stagedCliPath, launcherPath };
}

/**
 * Remove the staged runtime tree so uninstall leaves no orphan launcher /
 * bundle behind. Best-effort: a missing dir is a no-op.
 */
export function removeStagedRuntime(
  platform: StagingPlatform,
  home: string,
  env: NodeJS.ProcessEnv,
): { removed: boolean; dir: string } {
  const runtimeDir = stableRuntimeDir(platform, home, env);
  if (!existsSync(runtimeDir)) {
    return { removed: false, dir: runtimeDir };
  }
  try {
    rmSync(runtimeDir, { recursive: true, force: true });
    return { removed: true, dir: runtimeDir };
  } catch {
    return { removed: false, dir: runtimeDir };
  }
}

/**
 * Resolve the native-host package's own `dist/` directory from the running
 * module, robust to symlinks. When this file runs from `dist/registration/`,
 * the dist root is one level up.
 *
 * Falls back to the directory this module sits in if the expected layout is
 * not found — callers may also pass an explicit `sourceDistDir`.
 */
export function resolveSourceDistDir(): string {
  let here: string;
  try {
    here = realpathSync(dirname(fileURLToPath(import.meta.url)));
  } catch {
    here = dirname(fileURLToPath(import.meta.url));
  }
  // dist/registration/staging.js -> dist
  const distRoot = dirname(here);
  if (existsSync(join(distRoot, "cli.js"))) {
    return distRoot;
  }
  // Already at dist (defensive) or running from source under tsx.
  if (existsSync(join(here, "cli.js"))) {
    return here;
  }
  return distRoot;
}
