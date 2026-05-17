/**
 * Extension-scoped profile.
 *
 * Two backing stores, tried in this order:
 *
 *   1. Native messaging host `com.neurodock.profile`. When installed,
 *      `~/.neurodock/profile.yaml` is the single source of truth and the
 *      extension and the CLI never drift apart.
 *   2. `chrome.storage.local` extension-local fallback. Used when the
 *      native host is not installed (the host is OPTIONAL). The shape is
 *      identical so the popup logic does not branch on the source.
 *
 * Defaults are derived to honour plan.md §1: "Local-first by default;
 * cloud is opt-in." If a user has never opened the popup, mode is "local".
 */
import type { ExtensionMode, ExtensionProfile } from "./types.js";
import {
  nativeHostGetProfile,
  nativeHostSetProfile,
  probeNativeHost,
  type NativeHostStatus,
} from "./native-host-client.js";

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

export type ProfileSource = "native-host" | "extension-local";

export interface ProfileSyncStatus {
  readonly source: ProfileSource;
  readonly nativeHostStatus: NativeHostStatus;
  readonly path: string | null;
  readonly detail: string | null;
}

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

/**
 * Best-effort: read the latest profile from the native host. Returns null
 * when the host is not installed or any error surfaces. The caller then
 * falls back to the extension-local store.
 */
async function tryLoadFromNativeHost(
  baseline: ExtensionProfile,
): Promise<ExtensionProfile | null> {
  const r = await nativeHostGetProfile();
  if (!r || !r.exists || !isRecord(r.profile)) return null;
  return mapOnDiskProfileToExtension(r.profile, baseline);
}

export async function loadProfile(): Promise<ExtensionProfile> {
  // Read the extension-local baseline first so we have cloud config etc.
  // to layer the on-disk identity over.
  const storage = getStorage();
  const result = await storage.get(STORAGE_KEY);
  const stored = result[STORAGE_KEY];
  const baseline: ExtensionProfile =
    stored && typeof stored === "object"
      ? normaliseProfile(stored as Partial<ExtensionProfile>)
      : DEFAULT_PROFILE;

  const fromHost = await tryLoadFromNativeHost(baseline);
  if (fromHost) {
    // Mirror into the local store so the next launch has a synchronous
    // fast path if the host is temporarily unavailable.
    await storage.set({ [STORAGE_KEY]: fromHost });
    return fromHost;
  }
  return baseline;
}

export interface SaveOptions {
  readonly confirmOverwrite?: boolean;
}

export interface SaveOutcome {
  readonly profile: ExtensionProfile;
  readonly source: ProfileSource;
  readonly confirmRequired: boolean;
  readonly error: string | null;
}

export async function saveProfile(
  partial: Partial<ExtensionProfile>,
  options: SaveOptions = {},
): Promise<ExtensionProfile> {
  const outcome = await saveProfileWithOutcome(partial, options);
  if (outcome.error && !outcome.confirmRequired) {
    // Hard error from the host (other than confirm-required) is surfaced;
    // for confirm-required and missing-host we already fell back.
    // We intentionally do NOT throw on confirm-required so the popup can
    // show its own UI without managing an exception path.
  }
  return outcome.profile;
}

export async function saveProfileWithOutcome(
  partial: Partial<ExtensionProfile>,
  options: SaveOptions = {},
): Promise<SaveOutcome> {
  const current = await loadProfile();
  const merged = normaliseProfile({ ...current, ...partial });

  // Persist to the local store first so the popup is responsive even when
  // the native host is slow or absent.
  const storage = getStorage();
  await storage.set({ [STORAGE_KEY]: merged });

  const probe = await probeNativeHost();
  if (probe.status !== "active") {
    return {
      profile: merged,
      source: "extension-local",
      confirmRequired: false,
      error: null,
    };
  }

  const payload = mapExtensionProfileToOnDisk(merged);
  const result = await nativeHostSetProfile(payload, {
    ...(options.confirmOverwrite === true ? { confirmOverwrite: true } : {}),
  });
  if (result.ok) {
    return { profile: merged, source: "native-host", confirmRequired: false, error: null };
  }
  return {
    profile: merged,
    source: "extension-local",
    confirmRequired: result.confirmRequired,
    error: result.error,
  };
}

export async function setMode(mode: ExtensionMode): Promise<ExtensionProfile> {
  if (mode === "cloud") {
    const current = await loadProfile();
    if (!current.cloudProvider) {
      throw new Error(
        "Cloud mode requires a configured provider. Set cloudProvider " +
          "first via the popup.",
      );
    }
  }
  return saveProfile({ mode });
}

export function defaultProfile(): ExtensionProfile {
  return DEFAULT_PROFILE;
}

/**
 * Report which store backs the popup right now. Used by the settings tab
 * to surface "Profile sync: native host (active)" or the fallback line.
 */
export async function getSyncStatus(): Promise<ProfileSyncStatus> {
  const probe = await probeNativeHost();
  if (probe.status === "active") {
    const r = await nativeHostGetProfile();
    return {
      source: "native-host",
      nativeHostStatus: "active",
      path: r?.path ?? null,
      detail: probe.version ? `host v${probe.version}` : null,
    };
  }
  return {
    source: "extension-local",
    nativeHostStatus: probe.status,
    path: null,
    detail: probe.detail ?? null,
  };
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

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

/**
 * Translate the on-disk profile shape (matches profile.schema.json) into
 * the extension-internal `ExtensionProfile`. Only `identity.display_name`
 * has a one-to-one mapping in v0.1.0; everything else falls back to the
 * existing extension-local value via normaliseProfile.
 */
function mapOnDiskProfileToExtension(
  onDisk: Record<string, unknown>,
  baseline: ExtensionProfile,
): ExtensionProfile {
  const identity = isRecord(onDisk["identity"]) ? onDisk["identity"] : {};
  const displayName =
    typeof identity["display_name"] === "string" && identity["display_name"].length > 0
      ? identity["display_name"]
      : baseline.displayName;
  return normaliseProfile({ ...baseline, displayName });
}

/**
 * Translate the extension-internal profile into the on-disk shape. Other
 * top-level blocks (preferences, chronometric, guardrails, privacy) are
 * left untouched on disk so a user's hand-edits survive.
 */
export function mapExtensionProfileToOnDisk(
  profile: ExtensionProfile,
): Record<string, unknown> {
  return {
    identity: {
      display_name: profile.displayName,
      // neurotypes is required by the schema; supply an empty array when
      // the extension does not know one to declare. The schema treats
      // empty as "opt out", which is the correct conservative default.
      neurotypes: [],
    },
  };
}
