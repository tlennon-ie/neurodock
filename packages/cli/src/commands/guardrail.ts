/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 *
 * `neurodock guardrail status` — diagnostic readout of the proactive-
 * guardrail wiring on the current machine. Read-only: never modifies any
 * file.
 *
 * Why this command exists: 2026-05-26 silent-failure incident. The user
 * coded for 6 hours and the substrate never fired a single break warning.
 * Root cause: the Phase 3 daemon was never installed AND the Phase 1
 * session file was in a degraded shape (`{tool_count: N}` only, no
 * `started_at`), so the elapsed-time heuristic could not compute. With
 * `guardrail status` the user can see at a glance which piece is missing
 * before another long session goes silent.
 */
import { readFileSync, existsSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

interface StatusLine {
  readonly label: string;
  readonly ok: boolean;
  readonly detail: string;
}

interface GuardrailStatusResult {
  readonly lines: ReadonlyArray<StatusLine>;
  readonly anyFailure: boolean;
}

function homeFile(...parts: string[]): string {
  return join(homedir(), ...parts);
}

function checkPhase1HookRegistered(): StatusLine {
  const settingsPath = homeFile(".claude", "settings.json");
  if (!existsSync(settingsPath)) {
    return {
      label: "Phase 1 hook (Claude Code)",
      ok: false,
      detail: `~/.claude/settings.json not found — run 'neurodock install-hooks'`,
    };
  }
  try {
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as { hooks?: unknown };
    const text = JSON.stringify(parsed.hooks ?? {});
    if (
      text.includes("neurodock_proactive_guardrail") ||
      text.includes("proactive_guardrail.py")
    ) {
      return {
        label: "Phase 1 hook (Claude Code)",
        ok: true,
        detail: "registered in ~/.claude/settings.json",
      };
    }
    return {
      label: "Phase 1 hook (Claude Code)",
      ok: false,
      detail:
        "settings.json present but no NeuroDock hook entries — run 'neurodock install-hooks'",
    };
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : "parse failed";
    return {
      label: "Phase 1 hook (Claude Code)",
      ok: false,
      detail: `could not read settings.json (${msg})`,
    };
  }
}

function checkSessionShape(): StatusLine {
  const sessionPath = homeFile(".neurodock", "state", "guardrail-session.json");
  if (!existsSync(sessionPath)) {
    return {
      label: "Session state shape",
      ok: false,
      detail:
        "no session state yet — open Claude Code and submit one prompt to bootstrap",
    };
  }
  try {
    const raw = readFileSync(sessionPath, "utf8");
    const parsed = JSON.parse(raw) as {
      started_at?: unknown;
      tool_count?: unknown;
    };
    if (typeof parsed.started_at !== "string") {
      return {
        label: "Session state shape",
        ok: false,
        detail:
          "missing 'started_at' (degraded shape) — the Phase 1 hook's defensive bootstrap will fix this on the next PreToolUse event",
      };
    }
    return {
      label: "Session state shape",
      ok: true,
      detail: `started_at=${parsed.started_at} tool_count=${String(
        parsed.tool_count ?? 0,
      )}`,
    };
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : "parse failed";
    return {
      label: "Session state shape",
      ok: false,
      detail: `could not parse guardrail-session.json (${msg})`,
    };
  }
}

function checkDaemonScriptPresent(): StatusLine {
  const daemonPath = homeFile(".neurodock", "hooks", "neurodock_daemon.py");
  if (!existsSync(daemonPath)) {
    return {
      label: "Phase 3 daemon script",
      ok: false,
      detail: `not found at ${daemonPath} — run 'neurodock install-hooks --install-daemon'`,
    };
  }
  return {
    label: "Phase 3 daemon script",
    ok: true,
    detail: daemonPath,
  };
}

function checkDaemonAutostart(): StatusLine {
  if (platform() === "win32") {
    try {
      const out = execSync(
        'reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v NeuroDockGuardrail',
        {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      if (out.includes("NeuroDockGuardrail")) {
        return {
          label: "Daemon autostart (HKCU Run)",
          ok: true,
          detail: "registered",
        };
      }
    } catch {
      // reg query failed = key not present
    }
    return {
      label: "Daemon autostart (HKCU Run)",
      ok: false,
      detail: "not registered — run 'neurodock install-hooks --install-daemon'",
    };
  }
  if (platform() === "darwin") {
    const plistPath = homeFile(
      "Library",
      "LaunchAgents",
      "com.neurodock.guardrail.plist",
    );
    if (existsSync(plistPath)) {
      return {
        label: "Daemon autostart (LaunchAgent)",
        ok: true,
        detail: plistPath,
      };
    }
    return {
      label: "Daemon autostart (LaunchAgent)",
      ok: false,
      detail: `not at ${plistPath} — run 'neurodock install-hooks --install-daemon'`,
    };
  }
  const unitPath = homeFile(
    ".config",
    "systemd",
    "user",
    "neurodock-guardrail.service",
  );
  if (existsSync(unitPath)) {
    return {
      label: "Daemon autostart (systemd --user)",
      ok: true,
      detail: unitPath,
    };
  }
  return {
    label: "Daemon autostart (systemd --user)",
    ok: false,
    detail: `not at ${unitPath} — run 'neurodock install-hooks --install-daemon'`,
  };
}

function checkDaemonRunning(): StatusLine {
  const logPath = homeFile(".neurodock", "state", "daemon-log.jsonl");
  if (!existsSync(logPath)) {
    return {
      label: "Daemon liveness",
      ok: false,
      detail: "no daemon-log.jsonl — daemon has never ticked on this machine",
    };
  }
  try {
    const stats = statSync(logPath);
    const ageMin = (Date.now() - stats.mtimeMs) / 60000;
    if (ageMin > 15) {
      return {
        label: "Daemon liveness",
        ok: false,
        detail: `last log entry was ${Math.round(
          ageMin,
        )} min ago — daemon may have crashed or been stopped`,
      };
    }
    return {
      label: "Daemon liveness",
      ok: true,
      detail: `last tick ${Math.round(ageMin)} min ago`,
    };
  } catch (cause) {
    const msg = cause instanceof Error ? cause.message : "stat failed";
    return { label: "Daemon liveness", ok: false, detail: msg };
  }
}

export function collectGuardrailStatus(): GuardrailStatusResult {
  const lines: StatusLine[] = [
    checkPhase1HookRegistered(),
    checkSessionShape(),
    checkDaemonScriptPresent(),
    checkDaemonAutostart(),
    checkDaemonRunning(),
  ];
  return {
    lines,
    anyFailure: lines.some((line) => !line.ok),
  };
}

export interface GuardrailStatusOptions {
  readonly print: (msg: string) => void;
}

export function runGuardrailStatus(opts: GuardrailStatusOptions): {
  exitCode: number;
} {
  const result = collectGuardrailStatus();
  opts.print("NeuroDock proactive-guardrail wiring status:");
  opts.print("");
  for (const line of result.lines) {
    const tag = line.ok ? "OK     " : "MISSING";
    opts.print(`  [${tag}] ${line.label}`);
    opts.print(`            ${line.detail}`);
  }
  opts.print("");
  if (result.anyFailure) {
    opts.print(
      "One or more pieces are missing. Run 'neurodock install-hooks --install-daemon' " +
        "to wire everything in one step. Re-run 'neurodock guardrail status' afterwards.",
    );
    return { exitCode: 1 };
  }
  opts.print("All guardrail wiring present.");
  return { exitCode: 0 };
}
