import { describe, it, expect } from "vitest";
import {
  detectCapabilities,
  type CapabilityProbeDeps,
} from "../src/capabilities.js";

const HOME = "/home/tester";

const SETTINGS_PATH = `${HOME}/.claude/settings.json`.replace(/\//g, sep());

function sep(): string {
  // node:path join uses the platform separator; tests build expected paths
  // the same way the implementation does.
  return process.platform === "win32" ? "\\" : "/";
}

function joinHome(...parts: string[]): string {
  return [HOME.replace(/\//g, sep()), ...parts].join(sep());
}

interface FakeFsOptions {
  readonly files?: Record<string, string>;
}

function makeDeps(
  opts: FakeFsOptions & {
    platform?: string;
    windowsRunKeyRegistered?: () => boolean;
  } = {},
): CapabilityProbeDeps {
  const files = opts.files ?? {};
  return {
    homedir: () => HOME.replace(/\//g, sep()),
    platform: () => opts.platform ?? "linux",
    existsSync: (path: string) => path in files,
    readFileSync: (path: string) => {
      const content = files[path];
      if (content === undefined) throw new Error(`ENOENT: ${path}`);
      return content;
    },
    ...(opts.windowsRunKeyRegistered !== undefined
      ? { windowsRunKeyRegistered: opts.windowsRunKeyRegistered }
      : {}),
  };
}

function settingsWithHookCommand(command: string): string {
  return JSON.stringify({
    hooks: {
      PreToolUse: [{ matcher: "", hooks: [{ type: "command", command }] }],
    },
  });
}

describe("detectCapabilities", () => {
  it("always reports profile: true (the host is responding)", () => {
    const caps = detectCapabilities(makeDeps());
    expect(caps.profile).toBe(true);
  });

  describe("hooks", () => {
    it("is true when settings.json wires proactive_guardrail.py", () => {
      const caps = detectCapabilities(
        makeDeps({
          files: {
            [SETTINGS_PATH]: settingsWithHookCommand(
              'python "/home/tester/.neurodock/hooks/proactive_guardrail.py" pre-tool',
            ),
          },
        }),
      );
      expect(caps.hooks).toBe(true);
    });

    it("is true when only the neurodock marker description is present", () => {
      const settings = JSON.stringify({
        hooks: {
          Stop: [
            {
              matcher: "",
              hooks: [
                {
                  type: "command",
                  command: "some-renamed-wrapper stop",
                  description: "neurodock-proactive-guardrail",
                },
              ],
            },
          ],
        },
      });
      const caps = detectCapabilities(
        makeDeps({ files: { [SETTINGS_PATH]: settings } }),
      );
      expect(caps.hooks).toBe(true);
    });

    it("is false when settings.json does not exist", () => {
      const caps = detectCapabilities(makeDeps());
      expect(caps.hooks).toBe(false);
    });

    it("is false when settings.json has hooks from other tools only", () => {
      const caps = detectCapabilities(
        makeDeps({
          files: {
            [SETTINGS_PATH]: settingsWithHookCommand("other-tool format"),
          },
        }),
      );
      expect(caps.hooks).toBe(false);
    });

    it("is false when settings.json is unparseable", () => {
      const caps = detectCapabilities(
        makeDeps({ files: { [SETTINGS_PATH]: "{not json" } }),
      );
      expect(caps.hooks).toBe(false);
    });
  });

  describe("daemon", () => {
    it("linux: true when the systemd --user unit exists", () => {
      const unit = joinHome(
        ".config",
        "systemd",
        "user",
        "neurodock-guardrail.service",
      );
      const caps = detectCapabilities(
        makeDeps({ platform: "linux", files: { [unit]: "" } }),
      );
      expect(caps.daemon).toBe(true);
    });

    it("linux: false when the systemd --user unit is missing", () => {
      const caps = detectCapabilities(makeDeps({ platform: "linux" }));
      expect(caps.daemon).toBe(false);
    });

    it("darwin: true when the LaunchAgent plist exists", () => {
      const plist = joinHome(
        "Library",
        "LaunchAgents",
        "com.neurodock.guardrail.plist",
      );
      const caps = detectCapabilities(
        makeDeps({ platform: "darwin", files: { [plist]: "" } }),
      );
      expect(caps.daemon).toBe(true);
    });

    it("darwin: false when the LaunchAgent plist is missing", () => {
      const caps = detectCapabilities(makeDeps({ platform: "darwin" }));
      expect(caps.daemon).toBe(false);
    });

    it("win32: reflects the HKCU Run autostart probe", () => {
      const registered = detectCapabilities(
        makeDeps({ platform: "win32", windowsRunKeyRegistered: () => true }),
      );
      expect(registered.daemon).toBe(true);

      const missing = detectCapabilities(
        makeDeps({ platform: "win32", windowsRunKeyRegistered: () => false }),
      );
      expect(missing.daemon).toBe(false);
    });
  });
});
