/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * Notifications inbox tab.
 *
 * Renders the local notifications list with per-item read/unread and
 * delete actions, bulk mark-all-read / delete-all, and per-category
 * mute toggles. The tab is a thin shell over `src/lib/notifications.ts`
 * — the storage module owns all persistence and broadcast wiring.
 *
 * Voice: ND-tone, plain language, no emojis.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  deleteAll,
  deleteNotification,
  isMuted,
  listMutes,
  listNotifications,
  markAllRead,
  markRead,
  markUnread,
  setMute,
  type ExtensionNotification,
  type NotificationMute,
} from "../../src/lib/notifications.js";

const MUTE_CATEGORIES: ReadonlyArray<{
  readonly key: string;
  readonly label: string;
  readonly help: string;
  readonly options: ReadonlyArray<{
    readonly label: string;
    readonly until: string | null;
  }>;
}> = [
  {
    key: "watchdog:hyperfocus",
    label: "Hyperfocus nudges",
    help: "Late-streak translation count signal.",
    options: [
      { label: "1h", until: "1h" },
      { label: "4h", until: "4h" },
      { label: "Always", until: null },
    ],
  },
  {
    key: "watchdog:deep_night",
    label: "Late-night nudges",
    help: "Post-midnight activity signal.",
    options: [
      { label: "Tonight", until: "8h" },
      { label: "Always", until: null },
    ],
  },
  {
    key: "watchdog",
    label: "All proactive nudges",
    help: "Mute every watchdog signal.",
    options: [
      { label: "1h", until: "1h" },
      { label: "4h", until: "4h" },
      { label: "Always", until: null },
    ],
  },
];

interface MuteState {
  readonly [category: string]: boolean;
}

interface NotificationsTabProps {
  /** Test seam — supply a fake listNotifications. */
  readonly listFn?: typeof listNotifications;
}

export function NotificationsTab({
  listFn,
}: NotificationsTabProps): React.ReactElement {
  const [items, setItems] = useState<ExtensionNotification[]>([]);
  const [muteState, setMuteState] = useState<MuteState>({});
  const [loaded, setLoaded] = useState(false);

  const list = listFn ?? listNotifications;

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const [nots, mutes] = await Promise.all([list(200), listMutes()]);
      setItems(nots);
      setMuteState(await resolveAllMutes(mutes));
    } catch {
      // Storage failures degrade to empty inbox — never block the popup.
      setItems([]);
    } finally {
      setLoaded(true);
    }
  }, [list]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return undefined;
    }
    const handler = (msg: unknown): void => {
      if (!isNotificationsUpdated(msg)) return;
      void refresh();
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [refresh]);

  const handleToggleRead = useCallback(
    async (n: ExtensionNotification): Promise<void> => {
      if (n.readAt === null) {
        await markRead(n.id);
      } else {
        await markUnread(n.id);
      }
      await refresh();
    },
    [refresh],
  );

  const handleDelete = useCallback(
    async (id: string): Promise<void> => {
      await deleteNotification(id);
      await refresh();
    },
    [refresh],
  );

  const handleMarkAllRead = useCallback(async (): Promise<void> => {
    await markAllRead();
    await refresh();
  }, [refresh]);

  const handleDeleteAll = useCallback(async (): Promise<void> => {
    if (typeof window !== "undefined" && typeof window.confirm === "function") {
      const yes = window.confirm(
        "Delete every notification in this inbox? This cannot be undone.",
      );
      if (!yes) return;
    }
    await deleteAll();
    await refresh();
  }, [refresh]);

  const handleMute = useCallback(
    async (category: string, until: string | null): Promise<void> => {
      await setMute(category, until);
      await refresh();
    },
    [refresh],
  );

  const handleUnmute = useCallback(
    async (category: string): Promise<void> => {
      await setMute(category, "");
      await refresh();
    },
    [refresh],
  );

  const unreadCount = items.filter((n) => n.readAt === null).length;

  return (
    <section
      aria-labelledby="notifications-heading"
      className="flex flex-col gap-3"
      data-testid="notifications-tab"
    >
      <header className="flex items-center justify-between">
        <h2
          id="notifications-heading"
          className="font-heading m-0 text-base font-medium"
        >
          Notifications
          {unreadCount > 0 ? (
            <span
              className="ml-2 inline-block rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-normal text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
              data-testid="notifications-unread-count"
            >
              {unreadCount} unread
            </span>
          ) : null}
        </h2>
        {items.length > 0 ? (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              data-testid="notifications-mark-all-read"
              className="border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              Mark all read
            </button>
            <button
              type="button"
              onClick={() => void handleDeleteAll()}
              data-testid="notifications-delete-all"
              className="border border-neutral-300 bg-white px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
            >
              Delete all
            </button>
          </div>
        ) : null}
      </header>

      <MuteControls
        muteState={muteState}
        onMute={handleMute}
        onUnmute={handleUnmute}
      />

      {loaded && items.length === 0 ? (
        <p
          className="text-xs text-neutral-500"
          data-testid="notifications-empty"
        >
          Nothing here yet. Proactive nudges (hyperfocus, late-night,
          rumination) and guardrail signals will show up in this list so you can
          come back to them on your own time.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul
          className="m-0 flex max-h-72 list-none flex-col gap-1 overflow-auto p-0 text-xs"
          data-testid="notifications-list"
        >
          {items.map((n) => (
            <NotificationRow
              key={n.id}
              notification={n}
              onToggleRead={handleToggleRead}
              onDelete={handleDelete}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

interface NotificationRowProps {
  readonly notification: ExtensionNotification;
  readonly onToggleRead: (n: ExtensionNotification) => Promise<void> | void;
  readonly onDelete: (id: string) => Promise<void> | void;
}

function NotificationRow({
  notification,
  onToggleRead,
  onDelete,
}: NotificationRowProps): React.ReactElement {
  const isUnread = notification.readAt === null;
  return (
    <li
      className={
        "flex flex-col gap-1 border-b border-neutral-200 pb-1 dark:border-neutral-800 " +
        (isUnread ? "font-medium" : "text-neutral-600 dark:text-neutral-400")
      }
      data-testid="notifications-row"
      data-unread={isUnread ? "true" : "false"}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate">{notification.title}</div>
          <div className="text-neutral-500">
            {formatTimestamp(notification.createdAt)} · {notification.category}
            {notification.subcategory ? ` · ${notification.subcategory}` : ""}
          </div>
        </div>
        <div className="flex flex-shrink-0 gap-1">
          <button
            type="button"
            onClick={() => void onToggleRead(notification)}
            data-testid="notifications-row-toggle-read"
            aria-label={isUnread ? "Mark as read" : "Mark as unread"}
            className="border border-neutral-300 bg-white px-2 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            {isUnread ? "Mark read" : "Mark unread"}
          </button>
          <button
            type="button"
            onClick={() => void onDelete(notification.id)}
            data-testid="notifications-row-delete"
            aria-label="Delete notification"
            className="border border-neutral-300 bg-white px-2 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
          >
            Delete
          </button>
        </div>
      </div>
      {notification.body.length > 0 ? (
        <p className="m-0 whitespace-pre-line text-neutral-700 dark:text-neutral-300">
          {notification.body}
        </p>
      ) : null}
    </li>
  );
}

interface MuteControlsProps {
  readonly muteState: MuteState;
  readonly onMute: (category: string, until: string | null) => Promise<void>;
  readonly onUnmute: (category: string) => Promise<void>;
}

function MuteControls({
  muteState,
  onMute,
  onUnmute,
}: MuteControlsProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2 border border-neutral-200 bg-neutral-50 p-2 text-xs dark:border-neutral-800 dark:bg-neutral-900">
      <p className="m-0 text-neutral-600 dark:text-neutral-400">
        Mute categories. Muted signals still land in this inbox; only the
        toaster pop-up is suppressed.
      </p>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {MUTE_CATEGORIES.map((cat) => {
          const muted = muteState[cat.key] === true;
          return (
            <li
              key={cat.key}
              className="flex items-center justify-between gap-2"
              data-testid={`mute-row-${cat.key}`}
            >
              <span className="min-w-0 flex-1">
                <span className="font-medium">{cat.label}</span>
                <span className="ml-1 text-neutral-500">— {cat.help}</span>
              </span>
              {muted ? (
                <button
                  type="button"
                  onClick={() => void onUnmute(cat.key)}
                  data-testid={`mute-clear-${cat.key}`}
                  className="border border-neutral-300 bg-white px-2 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800"
                >
                  Unmute
                </button>
              ) : (
                <div className="flex gap-1">
                  {cat.options.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => void onMute(cat.key, opt.until)}
                      data-testid={`mute-${cat.key}-${opt.label}`}
                      className="border border-neutral-300 bg-white px-2 py-0.5 text-[11px] hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function isNotificationsUpdated(msg: unknown): boolean {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "notifications:updated"
  );
}

async function resolveAllMutes(
  mutes: readonly NotificationMute[],
): Promise<MuteState> {
  if (mutes.length === 0) return {};
  const out: Record<string, boolean> = {};
  for (const cat of MUTE_CATEGORIES) {
    out[cat.key] = await isMuted(...splitCategory(cat.key));
  }
  return out;
}

function splitCategory(key: string): [string, string?] {
  const idx = key.indexOf(":");
  if (idx === -1) return [key];
  return [key.slice(0, idx), key.slice(idx + 1)];
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
