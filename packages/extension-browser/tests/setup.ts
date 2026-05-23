import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

// Minimal chrome.* shim for tests that hit the profile module via the
// chrome.storage.local path. Tests can override per-suite.
type StorageRecord = Record<string, unknown>;

const memory: StorageRecord = {};

// chrome.permissions shim. Tests that exercise the v0.0.4 host
// permission flow override these via `vi.spyOn(chrome.permissions, …)`.
// The default behaviour is:
//   - request(): denies everything (so unit tests must explicitly
//     stub a grant to assert positive behaviour).
//   - contains(): returns true for the standard always-granted hosts
//     (localhost, 127.0.0.1) and false otherwise.
//   - remove(): no-op success.
//   - getAll(): empty origins list.
const grantedOrigins = new Set<string>();

(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        const out: StorageRecord = {};
        for (const k of arr) {
          if (k in memory) out[k] = memory[k];
        }
        return out;
      },
      set: async (items: StorageRecord) => {
        for (const [k, v] of Object.entries(items)) memory[k] = v;
      },
      clear: async () => {
        for (const k of Object.keys(memory)) delete memory[k];
      },
    },
  },
  runtime: {
    sendMessage: async () => ({ success: false, data: null, error: "no-bg" }),
    onMessage: { addListener: () => {}, removeListener: () => {} },
    onInstalled: { addListener: () => {}, removeListener: () => {} },
  },
  contextMenus: {
    create: () => {},
    onClicked: { addListener: () => {} },
  },
  tabs: { sendMessage: () => {} },
  permissions: {
    request: (perm: { origins?: string[] }, cb: (granted: boolean) => void) => {
      // Default behaviour: deny. Tests should spy on this to assert
      // arguments AND override the resolution.
      void perm;
      cb(false);
    },
    contains: (perm: { origins?: string[] }, cb: (has: boolean) => void) => {
      const origins = perm.origins ?? [];
      const has = origins.every((o) => {
        try {
          const trimmed = o.endsWith("/*") ? o.slice(0, -2) : o;
          const host = new URL(trimmed).hostname;
          if (host === "localhost" || host === "127.0.0.1") return true;
          return grantedOrigins.has(trimmed);
        } catch {
          return false;
        }
      });
      cb(has);
    },
    remove: (perm: { origins?: string[] }, cb: (ok: boolean) => void) => {
      for (const o of perm.origins ?? []) {
        const trimmed = o.endsWith("/*") ? o.slice(0, -2) : o;
        grantedOrigins.delete(trimmed);
      }
      cb(true);
    },
    getAll: (cb: (all: { origins: string[] }) => void) => {
      cb({ origins: Array.from(grantedOrigins).map((o) => `${o}/*`) });
    },
  },
};

// Helper exposed to tests so they can pre-grant origins for the
// non-prompting contains() path. Not used by production code.
export function __setGrantedOrigins(origins: readonly string[]): void {
  grantedOrigins.clear();
  for (const o of origins) grantedOrigins.add(o);
}
