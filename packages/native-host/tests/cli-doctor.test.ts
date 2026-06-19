import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir, platform as osPlatform } from "node:os";
import { join } from "node:path";
import { main } from "../src/cli.js";
import { HOST_NAME } from "../src/registration/types.js";

function sandbox(): { root: string; cleanup: () => void } {
  const root = mkdtempSync(join(tmpdir(), "nd-bindoc-"));
  return {
    root,
    cleanup: () => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

describe("neurodock-native-host doctor (bin) verifies the INSTALLED launcher", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports a not-installed FAIL (exit 1) when no manifest is on disk — does not re-stage", async () => {
    const s = sandbox();
    const isWin = osPlatform() === "win32";
    // Point the per-OS manifest root at an empty sandbox so the bin sees no
    // installed manifest. (Skips on platforms whose root we cannot redirect
    // here; the CLI-level test covers Linux explicitly.)
    if (!isWin && !process.env["XDG_CONFIG_HOME"]) {
      // On a unix host with no XDG override we cannot safely redirect; rely on
      // the explicit Linux coverage in the CLI doctor tests.
    }
    const savedAppData = process.env["APPDATA"];
    const savedXdg = process.env["XDG_CONFIG_HOME"];
    const out: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        out.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      });
    try {
      if (isWin) {
        process.env["APPDATA"] = join(s.root, "appdata-empty");
      } else {
        process.env["XDG_CONFIG_HOME"] = join(s.root, "config-empty");
      }
      const code = await main(["doctor"]);
      expect(code).toBe(1);
      const text = out.join("");
      expect(text).toMatch(/fail/i);
      expect(text).toMatch(/install/i);
    } finally {
      spy.mockRestore();
      if (savedAppData === undefined) delete process.env["APPDATA"];
      else process.env["APPDATA"] = savedAppData;
      if (savedXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
      else process.env["XDG_CONFIG_HOME"] = savedXdg;
      s.cleanup();
    }
  });

  it("FAILS (exit 1) when the installed manifest points at a missing launcher", async () => {
    const s = sandbox();
    const isWin = osPlatform() === "win32";
    const savedAppData = process.env["APPDATA"];
    const savedXdg = process.env["XDG_CONFIG_HOME"];
    const out: string[] = [];
    const spy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: string | Uint8Array): boolean => {
        out.push(typeof chunk === "string" ? chunk : chunk.toString());
        return true;
      });
    try {
      let manifestPath: string;
      if (isWin) {
        const appdata = join(s.root, "appdata");
        process.env["APPDATA"] = appdata;
        manifestPath = join(
          appdata,
          "NeuroDock",
          "native-host",
          `${HOST_NAME}.json`,
        );
      } else {
        const cfg = join(s.root, "config");
        process.env["XDG_CONFIG_HOME"] = cfg;
        manifestPath = join(
          cfg,
          "google-chrome",
          "NativeMessagingHosts",
          `${HOST_NAME}.json`,
        );
      }
      mkdirSync(join(manifestPath, ".."), { recursive: true });
      writeFileSync(
        manifestPath,
        JSON.stringify({
          name: HOST_NAME,
          path: join(s.root, "gone", "launcher"),
          type: "stdio",
        }),
      );
      const code = await main(["doctor"]);
      expect(code).toBe(1);
      const text = out.join("");
      expect(text).toMatch(/fail/i);
      expect(text).toMatch(/install/i);
    } finally {
      spy.mockRestore();
      if (savedAppData === undefined) delete process.env["APPDATA"];
      else process.env["APPDATA"] = savedAppData;
      if (savedXdg === undefined) delete process.env["XDG_CONFIG_HOME"];
      else process.env["XDG_CONFIG_HOME"] = savedXdg;
      s.cleanup();
    }
  });
});
