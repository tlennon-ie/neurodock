import { describe, it, expect } from "vitest";
import { runSetup, type SetupOptions } from "../src/commands/setup.js";
import type {
  InstallAllOptions,
  InstallAllResult,
} from "../src/commands/install-all.js";
import type {
  InstallHooksOptions,
  InstallHooksResult,
} from "../src/commands/install-hooks.js";

function makeInstallAllResult(
  overrides: Partial<InstallAllResult> = {},
): InstallAllResult {
  return {
    installer: "uv",
    packages: [],
    initResult: null,
    nativeHost: { status: "installed" },
    messages: ["[install-all] fake message"],
    exitCode: 0,
    ...overrides,
  };
}

function makeHooksResult(
  overrides: Partial<InstallHooksResult> = {},
): InstallHooksResult {
  return {
    messages: ["[install-hooks] fake message"],
    exitCode: 0,
    ...overrides,
  };
}

interface StubHarness {
  readonly installAllCalls: InstallAllOptions[];
  readonly hooksCalls: InstallHooksOptions[];
  readonly callOrder: string[];
  readonly deps: {
    runInstallAll: (opts: InstallAllOptions) => Promise<InstallAllResult>;
    runInstallHooks: (opts: InstallHooksOptions) => Promise<InstallHooksResult>;
  };
}

function makeStubs(
  installAllResult: InstallAllResult = makeInstallAllResult(),
  hooksResult: InstallHooksResult = makeHooksResult(),
): StubHarness {
  const installAllCalls: InstallAllOptions[] = [];
  const hooksCalls: InstallHooksOptions[] = [];
  const callOrder: string[] = [];
  return {
    installAllCalls,
    hooksCalls,
    callOrder,
    deps: {
      runInstallAll: (opts: InstallAllOptions) => {
        installAllCalls.push(opts);
        callOrder.push("install-all");
        return Promise.resolve(installAllResult);
      },
      runInstallHooks: (opts: InstallHooksOptions) => {
        hooksCalls.push(opts);
        callOrder.push("install-hooks");
        return Promise.resolve(hooksResult);
      },
    },
  };
}

function makeOptions(overrides: Partial<SetupOptions> = {}): SetupOptions {
  return {
    client: "all",
    profile: "example",
    installer: "auto",
    skipInstall: false,
    yes: false,
    dryRun: false,
    noNativeHost: false,
    daemon: false,
    ...overrides,
  };
}

describe("neurodock setup", () => {
  it("invokes install-all then install-hooks exactly once each", async () => {
    const stubs = makeStubs();

    const r = await runSetup(makeOptions(), stubs.deps);

    expect(stubs.installAllCalls).toHaveLength(1);
    expect(stubs.hooksCalls).toHaveLength(1);
    expect(stubs.callOrder).toEqual(["install-all", "install-hooks"]);
    expect(r.exitCode).toBe(0);
  });

  it("passes install-all flags through unchanged", async () => {
    const stubs = makeStubs();

    await runSetup(
      makeOptions({
        client: "claude-code",
        profile: "minimal",
        installer: "pip",
        skipInstall: true,
        yes: true,
        noNativeHost: true,
      }),
      stubs.deps,
    );

    expect(stubs.installAllCalls[0]).toEqual({
      client: "claude-code",
      profile: "minimal",
      installer: "pip",
      skipInstall: true,
      yes: true,
      dryRun: false,
      noNativeHost: true,
    });
  });

  it("--dry-run propagates to both underlying runners", async () => {
    const stubs = makeStubs();

    await runSetup(makeOptions({ dryRun: true }), stubs.deps);

    expect(stubs.installAllCalls[0]?.dryRun).toBe(true);
    expect(stubs.hooksCalls[0]?.dryRun).toBe(true);
  });

  it("daemon install is opt-in: off by default, on with --daemon", async () => {
    const off = makeStubs();
    await runSetup(makeOptions(), off.deps);
    expect(off.hooksCalls[0]?.installDaemon).toBe(false);

    const on = makeStubs();
    await runSetup(makeOptions({ daemon: true }), on.deps);
    expect(on.hooksCalls[0]?.installDaemon).toBe(true);
  });

  it("never asks install-hooks to uninstall or self-test", async () => {
    const stubs = makeStubs();

    await runSetup(makeOptions(), stubs.deps);

    expect(stubs.hooksCalls[0]?.uninstall).toBe(false);
    expect(stubs.hooksCalls[0]?.selfTest).toBe(false);
  });

  it("combines messages from both runners with step headers and a summary", async () => {
    const stubs = makeStubs();

    const r = await runSetup(makeOptions(), stubs.deps);

    const joined = r.messages.join("\n");
    expect(joined).toContain("Step 1/2");
    expect(joined).toContain("Step 2/2");
    expect(joined).toContain("[install-all] fake message");
    expect(joined).toContain("[install-hooks] fake message");
    expect(joined).toContain("Setup complete");
  });

  it("reports a combined outcome with both sub-results", async () => {
    const stubs = makeStubs();

    const r = await runSetup(makeOptions(), stubs.deps);

    expect(r.installAll.installer).toBe("uv");
    expect(r.hooks.exitCode).toBe(0);
  });

  it("preserves install-all's non-zero exit code", async () => {
    const stubs = makeStubs(makeInstallAllResult({ exitCode: 2 }));

    const r = await runSetup(makeOptions(), stubs.deps);

    expect(r.exitCode).toBe(2);
    expect(r.messages.join("\n")).not.toContain("Setup complete");
  });

  it("still runs install-hooks when install-all fails, and exits non-zero", async () => {
    const stubs = makeStubs(makeInstallAllResult({ exitCode: 1 }));

    const r = await runSetup(makeOptions(), stubs.deps);

    expect(stubs.hooksCalls).toHaveLength(1);
    expect(r.exitCode).toBe(1);
  });

  it("exits 1 when install-hooks fails even if install-all succeeded", async () => {
    const stubs = makeStubs(
      makeInstallAllResult(),
      makeHooksResult({ exitCode: 1 }),
    );

    const r = await runSetup(makeOptions(), stubs.deps);

    expect(r.exitCode).toBe(1);
    expect(r.messages.join("\n")).not.toContain("Setup complete");
  });
});
