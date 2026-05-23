import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  defaultProfile,
  loadProfile,
  saveProfile,
  setMode,
} from "../../src/lib/profile.js";

async function clearChromeStorage(): Promise<void> {
  const c = (
    globalThis as unknown as {
      chrome: { storage: { local: { clear: () => Promise<void> } } };
    }
  ).chrome;
  await c.storage.local.clear();
}

interface SendableChrome {
  runtime: { sendMessage: (msg: unknown) => Promise<unknown> };
}

function getChrome(): SendableChrome {
  return (globalThis as unknown as { chrome: SendableChrome }).chrome;
}

describe("profile", () => {
  beforeEach(async () => {
    await clearChromeStorage();
  });

  it("returns the safe local-first default when nothing is stored", async () => {
    const profile = await loadProfile();
    expect(profile.mode).toBe("local");
    expect(profile.historyEnabled).toBe(false);
    expect(profile.cloudProvider).toBeNull();
  });

  it("round-trips a saved profile patch", async () => {
    await saveProfile({ displayName: "T", historyEnabled: true });
    const profile = await loadProfile();
    expect(profile.displayName).toBe("T");
    expect(profile.historyEnabled).toBe(true);
    expect(profile.mode).toBe("local");
  });

  it("refuses cloud mode without a configured provider", async () => {
    let err: unknown;
    try {
      await setMode("cloud");
    } catch (e) {
      err = e;
    }
    expect((err as Error).message).toMatch(
      /Cloud mode requires a configured provider/,
    );
  });

  it("allows cloud mode after a provider id is configured", async () => {
    await saveProfile({
      cloudProvider: "anthropic",
      cloudModel: "claude-sonnet",
    });
    const next = await setMode("cloud");
    expect(next.mode).toBe("cloud");
    expect(next.cloudProvider).toBe("anthropic");
  });

  it("normalises invalid mode values back to local", async () => {
    await saveProfile({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mode: "nonsense" as any,
    });
    const profile = await loadProfile();
    expect(profile.mode).toBe("local");
  });

  it("exposes a frozen default profile", () => {
    const d = defaultProfile();
    expect(Object.isFrozen(d)).toBe(true);
  });

  // P1.1 — `saveProfileWithOutcome` now broadcasts a typed
  // `profile:updated` runtime message after every storage.set, so popups
  // in sibling browser windows can refresh without close+reopen and any
  // sibling content-script context double-confirms its storage-onChanged
  // re-read.
  it("broadcasts profile:updated after a successful save", async () => {
    const sendSpy = vi
      .spyOn(getChrome().runtime, "sendMessage")
      .mockResolvedValue(undefined);
    try {
      await saveProfile({ displayName: "broadcast-test" });
      // The broadcast is deferred via Promise.resolve().then(...). Flush
      // microtasks so the spy observes the call.
      await new Promise((r) => setTimeout(r, 0));
      const matching = sendSpy.mock.calls.filter((args) => {
        const msg = args[0] as { type?: string } | undefined;
        return msg?.type === "profile:updated";
      });
      expect(matching.length).toBeGreaterThanOrEqual(1);
      const payload = matching[0]![0] as {
        type: string;
        profile: { displayName: string };
      };
      expect(payload.profile.displayName).toBe("broadcast-test");
    } finally {
      sendSpy.mockRestore();
    }
  });

  it("does not throw if no receiver is listening for profile:updated", async () => {
    const sendSpy = vi
      .spyOn(getChrome().runtime, "sendMessage")
      .mockRejectedValue(new Error("Could not establish connection"));
    try {
      // Must not propagate — the broadcast is fire-and-forget.
      await expect(
        saveProfile({ displayName: "no-receiver" }),
      ).resolves.toBeDefined();
    } finally {
      sendSpy.mockRestore();
    }
  });
});
