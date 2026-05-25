/**
 * debug-log.ts
 *
 * Optional, off-by-default prompt logger. When the user enables
 * `chrome.storage.local["neurodock.debug.logPrompts"] === true`,
 * providers call `logPromptIfEnabled(...)` immediately before the
 * network fetch. The full prompt string lands in the service worker's
 * DevTools console so users reporting "the addendum isn't doing
 * anything" can grab a copy without us digging into their machine.
 *
 * Default is off. The Settings UI exposes the toggle. The cache below
 * avoids hitting `chrome.storage.local` on every translate call — we
 * read once, then live-update via the storage `onChanged` listener.
 *
 * Privacy contract:
 *   - Logs are local to the user's own DevTools console.
 *   - Nothing leaves the device.
 *   - The toggle is OFF by default; explicit user opt-in is required.
 *   - Provider modules never log prompts when this flag is false.
 */

export const PROMPT_LOG_STORAGE_KEY = "neurodock.debug.logPrompts";

interface ChromeStorageArea {
  readonly get: (keys: string | string[]) => Promise<Record<string, unknown>>;
}

interface ChromeStorageChange {
  readonly oldValue?: unknown;
  readonly newValue?: unknown;
}

interface ChromeStorageOnChanged {
  readonly addListener: (
    cb: (changes: Record<string, ChromeStorageChange>, area: string) => void,
  ) => void;
}

function getStorage(): ChromeStorageArea | null {
  return (
    (
      globalThis as unknown as {
        chrome?: { storage?: { local?: ChromeStorageArea } };
      }
    ).chrome?.storage?.local ?? null
  );
}

function getOnChanged(): ChromeStorageOnChanged | null {
  return (
    (
      globalThis as unknown as {
        chrome?: { storage?: { onChanged?: ChromeStorageOnChanged } };
      }
    ).chrome?.storage?.onChanged ?? null
  );
}

let cached: boolean | null = null;
let listenerWired = false;

function ensureListener(): void {
  if (listenerWired) return;
  const onChanged = getOnChanged();
  if (!onChanged) return;
  try {
    onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      const change = changes[PROMPT_LOG_STORAGE_KEY];
      if (!change) return;
      cached = change.newValue === true;
    });
    listenerWired = true;
  } catch {
    // Some test shims don't implement onChanged; tolerate.
  }
}

async function isEnabled(): Promise<boolean> {
  ensureListener();
  if (cached !== null) return cached;
  const storage = getStorage();
  if (storage === null) {
    cached = false;
    return false;
  }
  try {
    const got = await storage.get(PROMPT_LOG_STORAGE_KEY);
    cached = got[PROMPT_LOG_STORAGE_KEY] === true;
    return cached;
  } catch {
    cached = false;
    return false;
  }
}

/**
 * Reset the cached flag. Test-only — never called from production
 * code paths. Tests that flip the storage value need to invalidate
 * the in-memory cache so subsequent reads see fresh state.
 */
export function _resetPromptLogCacheForTests(): void {
  cached = null;
  listenerWired = false;
}

/**
 * Log the final prompt string when the user has explicitly opted in.
 * Never throws — a debug-log failure must not break a translate call.
 */
export async function logPromptIfEnabled(args: {
  readonly provider: string;
  readonly model: string;
  readonly tool: string;
  readonly prompt: string;
}): Promise<void> {
  try {
    if (!(await isEnabled())) return;
    // eslint-disable-next-line no-console
    console.log(
      "[NeuroDock][debug.logPrompts] provider=" +
        args.provider +
        " model=" +
        args.model +
        " tool=" +
        args.tool +
        "\n----- BEGIN PROMPT -----\n" +
        args.prompt +
        "\n----- END PROMPT -----",
    );
  } catch {
    // Swallow — debug logging is best-effort.
  }
}
