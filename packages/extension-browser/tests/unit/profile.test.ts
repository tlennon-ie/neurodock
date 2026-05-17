import { describe, it, expect, beforeEach } from "vitest";
import {
  defaultProfile,
  loadProfile,
  saveProfile,
  setMode,
} from "../../src/lib/profile.js";

async function clearChromeStorage(): Promise<void> {
  const c = (globalThis as unknown as { chrome: { storage: { local: { clear: () => Promise<void> } } } })
    .chrome;
  await c.storage.local.clear();
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
    await expect(setMode("cloud")).rejects.toThrow(
      /Cloud mode requires a configured provider/
    );
  });

  it("allows cloud mode after a provider id is configured", async () => {
    await saveProfile({ cloudProvider: "anthropic", cloudModel: "claude-sonnet" });
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
});
