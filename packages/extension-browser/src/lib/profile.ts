/**
 * Extension-scoped profile.
 *
 * v0.0.1: stored in chrome.storage.local. Local-only, never synced.
 *
 * v0.0.2+: read from ~/.neurodock/profile.yaml via native messaging. Until
 * the native host ships, the extension owns its own profile shape and the
 * `displayName` is the only field that meaningfully maps to the on-disk
 * profile.
 *
 * Defaults are derived to honour plan.md §1: "Local-first by default; cloud
 * is opt-in." If a user has never opened the popup, mode is "local".
 */
import type { ExtensionMode, ExtensionProfile } from "./types.js";

const STORAGE_KEY = "neurodock.profile.v1";

const DEFAULT_PROFILE: ExtensionProfile = Object.freeze({
  mode: "local",
  localEndpoint: "http://localhost:11434",
  localModel: "llama3.1:8b-instruct",
  cloudProvider: null,
  cloudModel: null,
  historyEnabled: false,
  displayName: "you",
});

export interface StorageLike {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function fallbackStorage(): StorageLike {
  // Used in tests when chrome.storage is not present.
  const memory = new Map<string, unknown>();
  return {
    async get(keys) {
      const arr = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of arr) {
        if (memory.has(k)) out[k] = memory.get(k);
      }
      return out;
    },
    async set(items) {
      for (const [k, v] of Object.entries(items)) memory.set(k, v);
    },
  };
}

function getStorage(): StorageLike {
  const g = globalThis as unknown as {
    chrome?: { storage?: { local?: StorageLike } };
  };
  if (g.chrome?.storage?.local) {
    return g.chrome.storage.local;
  }
  return fallbackStorage();
}

export async function loadProfile(): Promise<ExtensionProfile> {
  const storage = getStorage();
  const result = await storage.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY];
  if (!stored || typeof stored !== "object") {
    return DEFAULT_PROFILE;
  }
  return normaliseProfile(stored as Partial<ExtensionProfile>);
}

export async function saveProfile(
  partial: Partial<ExtensionProfile>
): Promise<ExtensionProfile> {
  const current = await loadProfile();
  const merged = normaliseProfile({ ...current, ...partial });
  const storage = getStorage();
  await storage.set({ [STORAGE_KEY]: merged });
  return merged;
}

export async function setMode(mode: ExtensionMode): Promise<ExtensionProfile> {
  if (mode === "cloud") {
    const current = await loadProfile();
    if (!current.cloudProvider) {
      throw new Error(
        "Cloud mode requires a configured provider. Set cloudProvider " +
          "first via the popup."
      );
    }
  }
  return saveProfile({ mode });
}

export function defaultProfile(): ExtensionProfile {
  return DEFAULT_PROFILE;
}

function normaliseProfile(input: Partial<ExtensionProfile>): ExtensionProfile {
  const mode: ExtensionMode = input.mode === "cloud" ? "cloud" : "local";
  return {
    mode,
    localEndpoint:
      typeof input.localEndpoint === "string" && input.localEndpoint.length > 0
        ? input.localEndpoint
        : DEFAULT_PROFILE.localEndpoint,
    localModel:
      typeof input.localModel === "string" && input.localModel.length > 0
        ? input.localModel
        : DEFAULT_PROFILE.localModel,
    cloudProvider:
      typeof input.cloudProvider === "string" && input.cloudProvider.length > 0
        ? input.cloudProvider
        : null,
    cloudModel:
      typeof input.cloudModel === "string" && input.cloudModel.length > 0
        ? input.cloudModel
        : null,
    historyEnabled: input.historyEnabled === true,
    displayName:
      typeof input.displayName === "string" && input.displayName.length > 0
        ? input.displayName
        : DEFAULT_PROFILE.displayName,
  };
}
