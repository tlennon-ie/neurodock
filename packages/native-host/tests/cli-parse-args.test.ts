import { describe, it, expect } from "vitest";
import { parseArgs } from "../src/cli.js";

describe("parseArgs", () => {
  it("runs the stdio host when argv is empty", () => {
    expect(parseArgs([]).command).toBe("run");
  });

  it("runs when the first arg is literally 'run'", () => {
    expect(parseArgs(["run"]).command).toBe("run");
  });

  it("routes a chrome-extension:// origin arg to run (defect #3 fix)", () => {
    // Chrome launches the host with the calling extension's origin as the
    // first CLI arg. An unrecognised first arg must NOT print help.
    expect(
      parseArgs(["chrome-extension://lcdaiekokkgniiknejddojkfkoiinopo/"])
        .command,
    ).toBe("run");
  });

  it("routes a moz-extension:// origin arg to run", () => {
    expect(
      parseArgs(["moz-extension://abcdef12-3456-7890-abcd-ef1234567890/"])
        .command,
    ).toBe("run");
  });

  it("routes Chrome's Windows --parent-window= arg to run", () => {
    expect(parseArgs(["--parent-window=0"]).command).toBe("run");
  });

  it("still recognises install / uninstall explicitly", () => {
    expect(parseArgs(["install"]).command).toBe("install");
    expect(parseArgs(["uninstall"]).command).toBe("uninstall");
  });

  it("still recognises --help and --version explicitly", () => {
    expect(parseArgs(["--help"]).command).toBe("help");
    expect(parseArgs(["-h"]).command).toBe("help");
    expect(parseArgs(["--version"]).command).toBe("version");
    expect(parseArgs(["-v"]).command).toBe("version");
  });

  it("still collects --extension-id values on install", () => {
    const parsed = parseArgs(["install", "--extension-id", "myid"]);
    expect(parsed.command).toBe("install");
    expect(parsed.extensionIds).toContain("myid");
  });
});
