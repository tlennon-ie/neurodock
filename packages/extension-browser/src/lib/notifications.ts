/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * In-extension notifications inbox.
 *
 * Today the proactive watchdog and the guardrail hooks call
 * `chrome.notifications.create` to surface signals. That is a fire-and-
 * forget surface: if the user dismisses the OS toast or misses it, the
 * signal is lost. ND users explicitly asked for an inbox they can come
 * back to later, manage, and quiet down per-category without disabling
 * the whole watchdog.
 *
 * Architecture:
 *
 * - Storage lives in `chrome.storage.local` only. Never `sync` — this is
 *   the same privacy contract as the rest of the extension (translation
 *   text and inboxes never leave the device).
 * - Two keys:
 *     `neurodock.notifications`      → array of records, newest-first.
 *     `neurodock.notificationMutes`  → array of mute entries by category.
 * - Records are capped at 200 with simple LRU eviction (drop the oldest
 *   tail) to keep chrome.storage well under its 5 MB quota even for the
 *   chattiest hyperfocus weeks.
 * - Every `appendNotification` broadcasts a runtime message so the popup
 *   can refresh live, mirroring the `history:updated` pattern.
 *
 * What this module does NOT do:
 *   - It never persists API keys, translation bodies, or anything that
 *     could leak sensitive content. Bodies are short user-facing copy
 *     authored by the caller (e.g. `renderSignal` from the watchdog).
 *   - It never triggers chrome.notifications itself. Callers are
 *     responsible for both surfaces — that lets the watchdog respect a
 *     mute by skipping the OS toast while still logging to the inbox so
 *     the user can audit "what got muted while I was away".
 */

export type NotificationCategory =
  | "guardrail"
  | "watchdog"
  | "translation_error"
  | "system";

export interface ExtensionNotification {
  readonly id: string;
  readonly category: NotificationCategory;
  readonly subcategory: string;
  readonly title: string;
  readonly body: string;
  readonly createdAt: string;
  readonly readAt: string | null;
  readonly meta: Readonly<Record<string, unknown>>;
}

export interface NotificationMute {
  readonly category: string;
  readonly until: string | null;
}

export interface AppendNotificationInput {
  readonly category: NotificationCategory;
  readonly subcategory: string;
  readonly title: string;
  readonly body: string;
  readonly meta?: Readonly<Record<string, unknown>>;
}

export const NOTIFICATIONS_STORAGE_KEY = "neurodock.notifications";
export const NOTIFICATION_MUTES_STORAGE_KEY = "neurodock.notificationMutes";
export const NOTIFICATIONS_UPDATED_MESSAGE = "notifications:updated";
export const MAX_STORED_NOTIFICATIONS = 200;

interface StorageLocalApi {
  readonly get: (keys: string | string[]) => Promise<Record<string, unknown>>;
  readonly set: (items: Record<string, unknown>) => Promise<void>;
}

interface RuntimeApi {
  readonly sendMessage?: (msg: unknown) => unknown;
}

interface ChromeShape {
  readonly storage?: { readonly local?: StorageLocalApi };
  readonly runtime?: RuntimeApi;
}

function chromeShape(): ChromeShape | null {
  const g = globalThis as unknown as { chrome?: ChromeShape };
  return g.chrome ?? null;
}

function getStorageLocal(): StorageLocalApi | null {
  return chromeShape()?.storage?.local ?? null;
}

/**
 * Source of `now`. Exposed via a module-level seam so tests can advance
 * time deterministically without monkey-patching `Date`.
 */
let clock: () => Date = () => new Date();

/** Test-only: substitute a deterministic clock. */
export function _setClockForTests(next: () => Date): void {
  clock = next;
}

/** Test-only: restore the default wall clock. */
export function _resetClockForTests(): void {
  clock = () => new Date();
}

/**
 * Generate a random id. Falls back to a timestamp+random hybrid when
 * `crypto.randomUUID` is missing (extremely old browsers / jsdom).
 */
function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidNotification(value: unknown): value is ExtensionNotification {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.category === "string" &&
    typeof v.subcategory === "string" &&
    typeof v.title === "string" &&
    typeof v.body === "string" &&
    typeof v.createdAt === "string" &&
    (v.readAt === null || typeof v.readAt === "string") &&
    typeof v.meta === "object" &&
    v.meta !== null
  );
}

function isValidMute(value: unknown): value is NotificationMute {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.category === "string" &&
    (v.until === null || typeof v.until === "string")
  );
}

async function readNotifications(): Promise<ExtensionNotification[]> {
  const local = getStorageLocal();
  if (!local) return [];
  try {
    const raw = await local.get(NOTIFICATIONS_STORAGE_KEY);
    const list = raw[NOTIFICATIONS_STORAGE_KEY];
    if (!Array.isArray(list)) return [];
    return list.filter(isValidNotification);
  } catch {
    // Storage corruption shouldn't break the popup — degrade to empty.
    return [];
  }
}

async function writeNotifications(
  items: readonly ExtensionNotification[],
): Promise<void> {
  const local = getStorageLocal();
  if (!local) return;
  await local.set({ [NOTIFICATIONS_STORAGE_KEY]: items });
}

async function readMutes(): Promise<NotificationMute[]> {
  const local = getStorageLocal();
  if (!local) return [];
  try {
    const raw = await local.get(NOTIFICATION_MUTES_STORAGE_KEY);
    const list = raw[NOTIFICATION_MUTES_STORAGE_KEY];
    if (!Array.isArray(list)) return [];
    return list.filter(isValidMute);
  } catch {
    return [];
  }
}

async function writeMutes(items: readonly NotificationMute[]): Promise<void> {
  const local = getStorageLocal();
  if (!local) return;
  await local.set({ [NOTIFICATION_MUTES_STORAGE_KEY]: items });
}

function broadcastUpdated(): void {
  const runtime = chromeShape()?.runtime;
  const send = runtime?.sendMessage;
  if (!send) return;
  try {
    const result = send({ type: NOTIFICATIONS_UPDATED_MESSAGE });
    // sendMessage may return a Promise that rejects when no receiver is
    // listening (popup closed). That is a normal state — swallow it.
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      (result as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    // Runtime API missing or threw — non-fatal.
  }
}

/**
 * Append a new notification and persist immutably (no in-place mutation
 * of the existing array). Returns the stored record so callers can use
 * the id for follow-up actions like immediate mark-read in tests.
 */
export async function appendNotification(
  input: AppendNotificationInput,
): Promise<ExtensionNotification> {
  const record: ExtensionNotification = {
    id: newId(),
    category: input.category,
    subcategory: input.subcategory,
    title: input.title,
    body: input.body,
    createdAt: clock().toISOString(),
    readAt: null,
    meta: { ...(input.meta ?? {}) },
  };
  const existing = await readNotifications();
  const next = [record, ...existing].slice(0, MAX_STORED_NOTIFICATIONS);
  await writeNotifications(next);
  broadcastUpdated();
  return record;
}

/**
 * List notifications newest-first. Returns a defensive copy.
 */
export async function listNotifications(
  limit?: number,
): Promise<ExtensionNotification[]> {
  const all = await readNotifications();
  // Stored newest-first by construction, but enforce sort defensively
  // so a corrupted write doesn't bleed into the UI.
  const sorted = [...all].sort((a, b) => {
    const aMs = Date.parse(a.createdAt);
    const bMs = Date.parse(b.createdAt);
    if (Number.isNaN(aMs) || Number.isNaN(bMs)) return 0;
    return bMs - aMs;
  });
  if (typeof limit === "number" && limit >= 0) {
    return sorted.slice(0, limit);
  }
  return sorted;
}

export async function markRead(id: string): Promise<void> {
  const existing = await readNotifications();
  const nowIso = clock().toISOString();
  let changed = false;
  const next = existing.map((n) => {
    if (n.id !== id) return n;
    if (n.readAt !== null) return n;
    changed = true;
    return { ...n, readAt: nowIso };
  });
  if (!changed) return;
  await writeNotifications(next);
  broadcastUpdated();
}

export async function markUnread(id: string): Promise<void> {
  const existing = await readNotifications();
  let changed = false;
  const next = existing.map((n) => {
    if (n.id !== id) return n;
    if (n.readAt === null) return n;
    changed = true;
    return { ...n, readAt: null };
  });
  if (!changed) return;
  await writeNotifications(next);
  broadcastUpdated();
}

export async function markAllRead(): Promise<void> {
  const existing = await readNotifications();
  const nowIso = clock().toISOString();
  let changed = false;
  const next = existing.map((n) => {
    if (n.readAt !== null) return n;
    changed = true;
    return { ...n, readAt: nowIso };
  });
  if (!changed) return;
  await writeNotifications(next);
  broadcastUpdated();
}

export async function deleteNotification(id: string): Promise<void> {
  const existing = await readNotifications();
  const next = existing.filter((n) => n.id !== id);
  if (next.length === existing.length) return;
  await writeNotifications(next);
  broadcastUpdated();
}

export async function deleteAll(): Promise<void> {
  const existing = await readNotifications();
  if (existing.length === 0) return;
  await writeNotifications([]);
  broadcastUpdated();
}

/**
 * Parse a relative duration like `"4h"`, `"30m"`, `"1d"` into an
 * absolute ISO timestamp relative to the current clock. Accepts:
 *
 *   - Number (treated as milliseconds from now).
 *   - String `"<n><unit>"` where unit is `m | h | d`.
 *   - ISO 8601 absolute timestamp (used verbatim).
 *   - `null` for permanent mute.
 */
export function resolveMuteUntil(until: string | number | null): string | null {
  if (until === null) return null;
  if (typeof until === "number") {
    if (!Number.isFinite(until) || until <= 0) return null;
    return new Date(clock().getTime() + until).toISOString();
  }
  const trimmed = until.trim();
  if (trimmed.length === 0) return null;
  const relative = /^(\d+)\s*([mhd])$/i.exec(trimmed);
  if (relative !== null) {
    const value = Number.parseInt(relative[1] ?? "0", 10);
    const unit = (relative[2] ?? "h").toLowerCase();
    const ms =
      unit === "m"
        ? value * 60_000
        : unit === "h"
          ? value * 60 * 60_000
          : value * 24 * 60 * 60_000;
    return new Date(clock().getTime() + ms).toISOString();
  }
  // Assume caller passed an absolute ISO timestamp.
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

/**
 * Set or clear a mute for a category (or `"category:subcategory"`).
 * Passing `until = null` makes the mute permanent until explicitly
 * cleared. Passing an empty string clears the mute.
 */
export async function setMute(
  category: string,
  until: string | number | null,
): Promise<void> {
  if (category.length === 0) return;
  const existing = await readMutes();
  const filtered = existing.filter((m) => m.category !== category);
  if (typeof until === "string" && until.trim().length === 0) {
    // Clear the mute.
    if (filtered.length === existing.length) return;
    await writeMutes(filtered);
    return;
  }
  const resolved = resolveMuteUntil(until);
  const next = [...filtered, { category, until: resolved }];
  await writeMutes(next);
}

export async function clearMute(category: string): Promise<void> {
  const existing = await readMutes();
  const next = existing.filter((m) => m.category !== category);
  if (next.length === existing.length) return;
  await writeMutes(next);
}

export async function listMutes(): Promise<NotificationMute[]> {
  return readMutes();
}

/**
 * Is the given category currently muted? Resolution order:
 *
 *   1. Exact `"category:subcategory"` mute, if subcategory supplied.
 *   2. Top-level `category` mute.
 *
 * Expired timestamp-based mutes are treated as inactive AND opportunistically
 * purged so the storage row doesn't accumulate stale entries.
 */
export async function isMuted(
  category: string,
  subcategory?: string,
): Promise<boolean> {
  const existing = await readMutes();
  if (existing.length === 0) return false;
  const nowMs = clock().getTime();
  const stillActive: NotificationMute[] = [];
  let muted = false;
  for (const mute of existing) {
    const expired = mute.until !== null && Date.parse(mute.until) <= nowMs;
    if (expired) continue;
    stillActive.push(mute);
    const matchesExact =
      typeof subcategory === "string" &&
      subcategory.length > 0 &&
      mute.category === `${category}:${subcategory}`;
    const matchesTop = mute.category === category;
    if (matchesExact || matchesTop) muted = true;
  }
  if (stillActive.length !== existing.length) {
    // Purge expired entries — fire-and-forget so the caller isn't
    // blocked on the write.
    void writeMutes(stillActive);
  }
  return muted;
}
