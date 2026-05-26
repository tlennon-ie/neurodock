/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * `neurodock install-hooks` — wire NeuroDock's proactive guardrails into
 * Claude Code's hook system.
 *
 * What this does (idempotent):
 *
 *   1. Copies the bundled `proactive_guardrail.py` script to
 *      `~/.neurodock/hooks/proactive_guardrail.py` (creating dirs as needed).
 *   2. Merges four hook entries (SessionStart / PreToolUse / PostToolUse /
 *      Stop) into `~/.claude/settings.json`, preserving any existing hooks
 *      from other tools and skipping if NeuroDock entries are already
 *      present.
 *   3. Optionally runs the script's `self-test` to verify Python is on
 *      PATH and the heuristics fire.
 *
 * Why a CLI command and not just docs:
 *
 *   The setup is fiddly enough that asking users to hand-edit JSON to
 *   wire four hooks is the kind of friction that defeats the whole
 *   proactive-guardrails purpose. The user types one command.
 *
 * Opt-out:
 *
 *   `neurodock install-hooks --uninstall` removes the hook entries
 *   (leaves the script in place — re-enabling is just a re-run).
 *   Environment variable `NEURODOCK_GUARDRAILS=off` disables the hook
 *   without touching settings.json.
 */
import { mkdirSync, readFileSync, existsSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { atomicWriteOverwrite } from "../util/atomic-write.js";
import { spawnSync } from "node:child_process";

export interface InstallHooksOptions {
  readonly dryRun: boolean;
  readonly selfTest: boolean;
  readonly uninstall: boolean;
  /**
   * 0.0.23: also wire the long-running Phase 3 daemon at user-login
   * autostart (HKCU Run on Windows, LaunchAgent on macOS, systemd
   * --user unit on Linux). Off by default — the daemon is optional;
   * the Phase 1 Claude Code hook + Phase 2 extension watchdog cover
   * the common cases. The daemon adds host-agnostic coverage (catches
   * you working in the terminal at 02:00 too).
   */
  readonly installDaemon?: boolean;
}

export interface InstallHooksResult {
  readonly messages: string[];
  readonly exitCode: number;
}

const HOOK_EVENTS = [
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "Stop",
] as const;

type HookEvent = (typeof HOOK_EVENTS)[number];

const SUBCOMMAND_FOR_EVENT: Record<HookEvent, string> = {
  SessionStart: "session-start",
  PreToolUse: "pre-tool",
  PostToolUse: "post-tool",
  Stop: "stop",
};

const NEURODOCK_MARKER = "neurodock-proactive-guardrail";

export async function runInstallHooks(
  options: InstallHooksOptions,
): Promise<InstallHooksResult> {
  const messages: string[] = [];
  const hookDir = join(homedir(), ".neurodock", "hooks");
  const targetScript = join(hookDir, "proactive_guardrail.py");
  const settingsPath = join(homedir(), ".claude", "settings.json");

  if (options.uninstall) {
    return uninstallHooks(settingsPath, options.dryRun);
  }

  // 1. Copy the bundled script(s).
  const sourceScript = resolveBundledScript("proactive_guardrail.py");
  if (sourceScript === null) {
    return {
      messages: [
        "[install-hooks] could not locate the bundled proactive_guardrail.py.",
        "  This is a packaging bug — the script should ship with @neurodock/cli.",
      ],
      exitCode: 1,
    };
  }
  const daemonSource = resolveBundledScript("neurodock_daemon.py");
  const daemonTarget = join(hookDir, "neurodock_daemon.py");
  if (options.dryRun) {
    messages.push(
      `[install-hooks] would copy ${sourceScript} -> ${targetScript}`,
    );
    if (daemonSource !== null) {
      messages.push(
        `[install-hooks] would copy ${daemonSource} -> ${daemonTarget}`,
      );
    }
  } else {
    mkdirSync(hookDir, { recursive: true });
    copyFileSync(sourceScript, targetScript);
    messages.push(`[install-hooks] copied script -> ${targetScript}`);
    if (daemonSource !== null) {
      copyFileSync(daemonSource, daemonTarget);
      messages.push(`[install-hooks] copied daemon -> ${daemonTarget}`);
    }
  }

  // 2. Merge hook entries into settings.json.
  const command = buildHookCommand(targetScript);
  // Always echo the exact command string we're about to write. The
  // Windows-path-escape bug (0.0.x ~/.neurodock/hooks/... mangled by
  // bash) was a silent foot-gun precisely because the install summary
  // didn't show it. Now it does, and a quick scan tells you whether
  // forward slashes survived.
  messages.push(`[install-hooks] hook command: ${command} <subcommand>`);
  const merged = mergeSettings(settingsPath, command);
  if (merged.changed) {
    if (options.dryRun) {
      messages.push("[install-hooks] would update ~/.claude/settings.json:");
      for (const line of merged.diff) messages.push(`  ${line}`);
    } else {
      mkdirSync(dirname(settingsPath), { recursive: true });
      // Atomic overwrite prevents a TOCTOU race between the existsSync
      // guard (above) and the write to settings.json.
      atomicWriteOverwrite(settingsPath, merged.json + "\n");
      messages.push("[install-hooks] updated ~/.claude/settings.json");
      for (const line of merged.diff) messages.push(`  ${line}`);
    }
  } else {
    messages.push(
      "[install-hooks] settings.json already wired — no change needed.",
    );
  }

  // 3. Optionally self-test.
  if (options.selfTest && !options.dryRun) {
    const selfTest = runSelfTest(targetScript);
    messages.push(`[install-hooks] self-test: ${selfTest.summary}`);
    if (selfTest.exitCode !== 0) {
      return { messages, exitCode: 1 };
    }
    if (daemonSource !== null) {
      const daemonSelfTest = runSelfTest(daemonTarget);
      messages.push(
        `[install-hooks] daemon self-test: ${daemonSelfTest.summary}`,
      );
    }
  }

  // 4. Optionally wire the daemon at user-login autostart.
  if (options.installDaemon === true && !options.dryRun) {
    if (daemonSource === null) {
      messages.push(
        "[install-hooks] daemon script not bundled — skipping autostart.",
      );
    } else {
      const result = spawnSync("python", [daemonTarget, "install"], {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      });
      if (result.error) {
        messages.push(
          `[install-hooks] daemon autostart skipped — python not on PATH (${result.error.message}).`,
        );
      } else if (result.status !== 0) {
        messages.push(
          `[install-hooks] daemon autostart failed: ${result.stderr.trim()}`,
        );
      } else {
        messages.push(
          `[install-hooks] daemon autostart: ${result.stdout.trim()}`,
        );
        // Also START the daemon immediately so the user does not have to
        // wait for the next login. Detached + unref so it survives this
        // process exit. The 2026-05-26 silent-failure incident was caused
        // exactly by registering autostart but never actually launching
        // the daemon, so the next 6h session ran with no guardrail tick.
        //
        // On Windows: use `pythonw.exe` (windows-subsystem) not `python.exe`
        // (console-subsystem) so the background daemon doesn't pop a black
        // terminal window. Same interpreter, no console. Pair with
        // `windowsHide: true` for belt-and-braces on the spawn itself.
        try {
          const { spawn } = await import("node:child_process");
          const isWindows = process.platform === "win32";
          const pythonExe = isWindows ? "pythonw" : "python";
          const child = spawn(pythonExe, [daemonTarget, "run"], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          });
          child.unref();
          messages.push(
            "[install-hooks] daemon started in background (run 'neurodock guardrail status' to confirm).",
          );
        } catch (cause) {
          const msg = cause instanceof Error ? cause.message : "spawn failed";
          messages.push(
            `[install-hooks] daemon autostart registered but background-launch failed (${msg}). It will run on next login.`,
          );
        }
      }
    }
  } else if (options.installDaemon === true && options.dryRun) {
    messages.push(
      "[install-hooks] would register daemon autostart (HKCU Run / LaunchAgent / systemd --user)",
    );
  }

  messages.push("");
  messages.push("Done. Open a new Claude Code session to activate the hooks.");
  messages.push(
    "Opt out anytime by setting NEURODOCK_GUARDRAILS=off in your environment,",
  );
  messages.push("or run: neurodock install-hooks --uninstall");
  return { messages, exitCode: 0 };
}

function uninstallHooks(
  settingsPath: string,
  dryRun: boolean,
): InstallHooksResult {
  const messages: string[] = [];
  // 0.0.23: also try to remove the daemon autostart entry. Best-effort
  // — if the daemon was never installed, the uninstall is a no-op.
  if (!dryRun) {
    const daemonTarget = join(
      homedir(),
      ".neurodock",
      "hooks",
      "neurodock_daemon.py",
    );
    if (existsSync(daemonTarget)) {
      const result = spawnSync("python", [daemonTarget, "uninstall"], {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      });
      if (!result.error && result.status === 0) {
        messages.push("[install-hooks] removed daemon autostart entry");
      }
    }
  } else {
    messages.push("[install-hooks] would also remove daemon autostart entry");
  }
  if (!existsSync(settingsPath)) {
    return {
      messages: [
        ...messages,
        "[install-hooks] no ~/.claude/settings.json to clean — nothing to do.",
      ],
      exitCode: 0,
    };
  }
  const raw = readFileSync(settingsPath, "utf8");
  const settings = parseSettings(raw);
  const hooks = isObject(settings.hooks) ? { ...settings.hooks } : {};
  let removedAny = false;
  for (const event of HOOK_EVENTS) {
    const entries = hooks[event];
    if (!Array.isArray(entries)) continue;
    const filtered = entries.filter((entry) => !isNeurodockHookEntry(entry));
    if (filtered.length !== entries.length) {
      removedAny = true;
      if (filtered.length === 0) {
        delete hooks[event];
      } else {
        hooks[event] = filtered;
      }
    }
  }
  if (!removedAny) {
    return {
      messages: [
        "[install-hooks] no NeuroDock hook entries found — nothing to do.",
      ],
      exitCode: 0,
    };
  }
  const next: Record<string, unknown> = { ...settings, hooks };
  // Drop empty hooks object so we don't leave dead structure behind.
  if (Object.keys(hooks).length === 0) delete next["hooks"];
  const formatted = JSON.stringify(next, null, 2);
  if (dryRun) {
    messages.push(
      "[install-hooks] would remove NeuroDock entries from ~/.claude/settings.json",
    );
  } else {
    // Atomic overwrite: the existsSync+read above and the write here have a
    // TOCTOU window; renaming a tmp file into place closes it.
    atomicWriteOverwrite(settingsPath, formatted + "\n");
    messages.push(
      "[install-hooks] removed NeuroDock entries from ~/.claude/settings.json",
    );
  }
  messages.push(
    "Hook script left at ~/.neurodock/hooks/ — delete manually if you want it gone.",
  );
  return { messages, exitCode: 0 };
}

// ─────────────────────────────────────────────────────────────────────
// Settings.json merging
// ─────────────────────────────────────────────────────────────────────

interface MergeResult {
  readonly changed: boolean;
  readonly json: string;
  readonly diff: string[];
}

function mergeSettings(settingsPath: string, command: string): MergeResult {
  let raw = "{}";
  if (existsSync(settingsPath)) {
    try {
      raw = readFileSync(settingsPath, "utf8");
    } catch {
      raw = "{}";
    }
  }
  const settings = parseSettings(raw);
  const hooks = isObject(settings.hooks) ? { ...settings.hooks } : {};
  const diff: string[] = [];
  let changed = false;
  for (const event of HOOK_EVENTS) {
    const existing = Array.isArray(hooks[event]) ? [...hooks[event]] : [];
    if (existing.some(isNeurodockHookEntry)) continue;
    const newEntry = buildHookEntry(event, command);
    existing.push(newEntry);
    hooks[event] = existing;
    diff.push(`+ ${event} -> ${SUBCOMMAND_FOR_EVENT[event]}`);
    changed = true;
  }
  if (!changed) {
    return { changed: false, json: raw, diff: [] };
  }
  const next = { ...settings, hooks };
  return {
    changed: true,
    json: JSON.stringify(next, null, 2),
    diff,
  };
}

function buildHookEntry(event: HookEvent, command: string): unknown {
  const subcommand = SUBCOMMAND_FOR_EVENT[event];
  return {
    // Claude Code reads this as a "matcher group". An empty matcher
    // applies to all events of this type, which is what we want — the
    // proactive guardrail evaluates on every event and decides whether
    // to fire based on its own state.
    matcher: "",
    hooks: [
      {
        type: "command",
        command: `${command} ${subcommand}`,
        // Tag the entry so neurodock install-hooks can find and remove
        // it later without scanning the entire command string.
        description: NEURODOCK_MARKER,
      },
    ],
  };
}

function buildHookCommand(scriptPath: string): string {
  // Always normalise to forward slashes. Python accepts them on Windows,
  // and bash-style shells (Git Bash / MinGW — what Claude Code uses on
  // Windows) strip backslashes from unquoted Windows paths, mangling
  // the path passed to python. Quoting alone isn't enough because the
  // JSON-decoded value goes through one more shell pass that strips
  // escape sequences like `\U`, `\h`. Forward slashes side-step it.
  const normalised = scriptPath.replace(/\\/g, "/");
  const quoted = `"${normalised}"`;
  return `python ${quoted}`;
}

function isNeurodockHookEntry(entry: unknown): boolean {
  if (!isObject(entry)) return false;
  const hooks = entry.hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.some((h) => {
    if (!isObject(h)) return false;
    const command = h.command;
    if (
      typeof command === "string" &&
      command.includes("proactive_guardrail.py")
    ) {
      return true;
    }
    const description = h.description;
    return typeof description === "string" && description === NEURODOCK_MARKER;
  });
}

function parseSettings(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw);
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ─────────────────────────────────────────────────────────────────────
// Locate the bundled script in dev (monorepo) and prod (npm install)
// ─────────────────────────────────────────────────────────────────────

function resolveBundledScript(filename: string): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    // Built: dist/commands/install-hooks.js -> ../assets/hooks/...
    resolve(here, "..", "assets", "hooks", filename),
    // Monorepo source: src/commands/install-hooks.ts -> ../assets/hooks/...
    resolve(here, "..", "..", "src", "assets", "hooks", filename),
    // node_modules install
    resolve(
      here,
      "..",
      "..",
      "node_modules",
      "@neurodock",
      "cli",
      "dist",
      "assets",
      "hooks",
      filename,
    ),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Self-test runner
// ─────────────────────────────────────────────────────────────────────

interface SelfTestResult {
  readonly summary: string;
  readonly exitCode: number;
}

function runSelfTest(scriptPath: string): SelfTestResult {
  const result = spawnSync("python", [scriptPath, "self-test"], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  if (result.error) {
    return {
      summary: `python not on PATH (${result.error.message}). Install Python 3.11+ and re-run.`,
      exitCode: 1,
    };
  }
  if (result.status !== 0) {
    return {
      summary: `self-test failed (exit ${
        result.status
      }): ${result.stderr.trim()}`,
      exitCode: result.status ?? 1,
    };
  }
  return {
    summary: result.stdout.trim() || "passed",
    exitCode: 0,
  };
}
