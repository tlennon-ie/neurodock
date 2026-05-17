/**
 * Local-only translation history via IndexedDB.
 *
 * Privacy notes:
 * - History is OFF by default (profile.historyEnabled === false). The
 *   service worker checks the flag before writing.
 * - Entries store only metadata + short previews (256 chars). Full input
 *   and output bodies are never persisted in v0.0.1.
 * - The DB is extension-scoped — no other extension or site can read it.
 * - There is no remote sync. Ever.
 */
import { openDB, type IDBPDatabase } from "idb";
import type { HistoryEntry } from "./types.js";

const DB_NAME = "neurodock-extension";
const DB_VERSION = 1;
const STORE = "history";
const MAX_PREVIEW_CHARS = 256;
const DEFAULT_PAGE_SIZE = 50;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          const store = d.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("by_timestamp", "timestamp");
        }
      },
    });
  }
  return dbPromise;
}

export function truncatePreview(text: string): string {
  if (text.length <= MAX_PREVIEW_CHARS) return text;
  return `${text.slice(0, MAX_PREVIEW_CHARS - 1)}…`;
}

export async function appendHistory(entry: HistoryEntry): Promise<void> {
  const d = await db();
  await d.put(STORE, {
    ...entry,
    inputPreview: truncatePreview(entry.inputPreview),
    outputSummary: truncatePreview(entry.outputSummary),
  });
}

export async function listHistory(
  limit: number = DEFAULT_PAGE_SIZE
): Promise<HistoryEntry[]> {
  const d = await db();
  const tx = d.transaction(STORE, "readonly");
  const store = tx.objectStore(STORE);
  const index = store.index("by_timestamp");
  const cursor = await index.openCursor(null, "prev");
  const out: HistoryEntry[] = [];
  let c = cursor;
  while (c && out.length < limit) {
    out.push(c.value as HistoryEntry);
    c = await c.continue();
  }
  await tx.done;
  return out;
}

export async function clearHistory(): Promise<void> {
  const d = await db();
  await d.clear(STORE);
}

/** Test-only: reset module-level handle so fake-indexeddb takes effect. */
export function _resetForTests(): void {
  dbPromise = null;
}
