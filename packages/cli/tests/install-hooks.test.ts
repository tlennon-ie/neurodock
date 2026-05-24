/**
 * Tests for `neurodock install-hooks` — the proactive-guardrail wiring.
 *
 * The most important test here is the Windows path-escape regression:
 * the command written into settings.json MUST use forward slashes, not
 * backslashes. Backslash paths get mangled by Git Bash / MinGW (which
 * is what Claude Code uses on Windows) — `\U`, `\h`, `\p` look like
 * escape sequences and get stripped, leaving `python C:Userscompu...`
 * which python.exe can't open, so the hook exits non-zero and BLOCKS
 * every subsequent tool call. We discovered this the hard way in
 * 0.0.22 — twice. This test pins the contract.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import { runInstallHooks } from "../src/commands/install-hooks.js";

let originalHome: string | undefined;
let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "neurodock-install-hooks-"));
  originalHome = process.env["HOME"];
  process.env["HOME"] = tmpHome;
  // Windows uses USERPROFILE
  process.env["USERPROFILE"] = tmpHome;
});

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env["HOME"];
  } else {
    process.env["HOME"] = originalHome;
  }
  process.env["USERPROFILE"] = originalHome ?? "";
  try {
    rmSync(tmpHome, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

describe("install-hooks", () => {
  it("dry-run does not write anything and reports what would happen", async () => {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    const before = existsSync(settingsPath)
      ? readFileSync(settingsPath, "utf8")
      : null;
    const r = await runInstallHooks({
      dryRun: true,
      selfTest: false,
      uninstall: false,
    });
    expect(r.exitCode).toBe(0);
    expect(r.messages.some((m) => m.includes("would update"))).toBe(true);
    // Same file untouched.
    const after = existsSync(settingsPath)
      ? readFileSync(settingsPath, "utf8")
      : null;
    expect(after).toBe(before);
  });

  it("writes a command using forward slashes (REGRESSION: 0.0.22 path-escape lockout)", async () => {
    const r = await runInstallHooks({
      dryRun: false,
      selfTest: false,
      uninstall: false,
    });
    expect(r.exitCode).toBe(0);
    const settingsPath = join(homedir(), ".claude", "settings.json");
    const raw = readFileSync(settingsPath, "utf8");
    const settings = JSON.parse(raw) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>;
    };
    for (const event of ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]) {
      const command = settings.hooks[event]?.[0]?.hooks?.[0]?.command;
      expect(command, `${event} command missing`).toBeTypeOf("string");
      // The hook path must use forward slashes — no backslashes anywhere
      // in the script-path portion. Reject `\U`, `\.`, `\h` and friends.
      expect(
        command,
        `${event} contains backslash — will be mangled by bash on Windows`,
      ).not.toMatch(/proactive_guardrail\.py.*\\/);
      // Path itself must be quoted (handles spaces in user home dir).
      expect(command).toMatch(/"[^"]+proactive_guardrail\.py"/);
    }
  });

  it("is idempotent — re-running does not duplicate entries", async () => {
    await runInstallHooks({ dryRun: false, selfTest: false, uninstall: false });
    const settingsPath = join(homedir(), ".claude", "settings.json");
    const first = readFileSync(settingsPath, "utf8");
    const second = await runInstallHooks({
      dryRun: false,
      selfTest: false,
      uninstall: false,
    });
    expect(second.exitCode).toBe(0);
    expect(second.messages.some((m) => m.includes("already wired"))).toBe(true);
    const after = readFileSync(settingsPath, "utf8");
    expect(after).toBe(first);
  });

  it("preserves existing unrelated hooks from other tools", async () => {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    mkdirSync(join(homedir(), ".claude"), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo unrelated" }],
            },
          ],
        },
        someOtherKey: "untouched",
      }),
      "utf8",
    );
    await runInstallHooks({ dryRun: false, selfTest: false, uninstall: false });
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
      someOtherKey: string;
    };
    expect(settings.someOtherKey).toBe("untouched");
    // Original unrelated entry survives.
    expect(
      settings.hooks.PreToolUse.some((entry) =>
        entry.hooks.some((h) => h.command === "echo unrelated"),
      ),
    ).toBe(true);
    // NeuroDock entry was appended.
    expect(
      settings.hooks.PreToolUse.some((entry) =>
        entry.hooks.some((h) => h.command.includes("proactive_guardrail.py")),
      ),
    ).toBe(true);
  });

  it("uninstall removes NeuroDock entries but leaves unrelated hooks", async () => {
    const settingsPath = join(homedir(), ".claude", "settings.json");
    mkdirSync(join(homedir(), ".claude"), { recursive: true });
    writeFileSync(
      settingsPath,
      JSON.stringify({
        hooks: {
          PreToolUse: [
            {
              matcher: "Bash",
              hooks: [{ type: "command", command: "echo unrelated" }],
            },
          ],
        },
      }),
      "utf8",
    );
    await runInstallHooks({ dryRun: false, selfTest: false, uninstall: false });
    const r = await runInstallHooks({
      dryRun: false,
      selfTest: false,
      uninstall: true,
    });
    expect(r.exitCode).toBe(0);
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> };
    };
    // The neurodock entries are gone…
    expect(
      settings.hooks.PreToolUse.some((entry) =>
        entry.hooks.some((h) => h.command.includes("proactive_guardrail.py")),
      ),
    ).toBe(false);
    // …but the unrelated one survives.
    expect(
      settings.hooks.PreToolUse.some((entry) =>
        entry.hooks.some((h) => h.command === "echo unrelated"),
      ),
    ).toBe(true);
  });
});
