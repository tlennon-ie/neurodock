import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";

// Minimal chrome.* shim for tests that hit the profile module via the
// chrome.storage.local path. Tests can override per-suite.
type StorageRecord = Record<string, unknown>;

const memory: StorageRecord = {};

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
    onMessage: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
  },
  contextMenus: {
    create: () => {},
    onClicked: { addListener: () => {} },
  },
  tabs: { sendMessage: () => {} },
};
