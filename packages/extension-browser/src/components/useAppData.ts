/*
 * SPDX-License-Identifier: AGPL-3.0-or-later
 * Copyright (c) 2026 NeuroDock contributors.
 */
/**
 * @license AGPL-3.0-or-later
 *
 * Shared data hook used by BOTH the popup and the full-tab view.
 *
 * The popup and the tab view render different layouts but read identical
 * data: the user's profile, the local translation history, the
 * native-host sync status, and any in-flight save errors. To guarantee
 * "no data duplication" between the two surfaces, both call this hook
 * (or hand the data through props derived from it).
 *
 * This hook intentionally re-uses the exact pre-existing module-level
 * functions (`loadProfile`, `saveProfileWithOutcome`, `listHistory`,
 * `clearHistory`, `getSyncStatus`) so tests that already mock those
 * modules continue to work without modification.
 */
import { useCallback, useEffect, useState } from "react";
import {
  defaultProfile,
  loadProfile,
  saveProfileWithOutcome,
  getSyncStatus,
  type ProfileSyncStatus,
} from "../lib/profile.js";
import { listHistory, clearHistory } from "../lib/storage.js";
import type { ExtensionProfile, HistoryEntry } from "../lib/types.js";

function isHistoryUpdatedMessage(msg: unknown): boolean {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "history:updated"
  );
}

interface ProfileUpdatedMessage {
  readonly type: "profile:updated";
  readonly profile: ExtensionProfile;
}

function isProfileUpdatedMessage(msg: unknown): msg is ProfileUpdatedMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "profile:updated" &&
    typeof (msg as { profile?: unknown }).profile === "object" &&
    (msg as { profile?: unknown }).profile !== null
  );
}

export interface AppData {
  readonly profile: ExtensionProfile;
  readonly history: readonly HistoryEntry[];
  readonly loaded: boolean;
  readonly syncStatus: ProfileSyncStatus | null;
  readonly saveError: string | null;
  readonly update: (patch: Partial<ExtensionProfile>) => Promise<void>;
  readonly dismissSaveError: () => void;
  readonly refreshHistory: () => Promise<void>;
  readonly clearAllHistory: () => Promise<void>;
}

const HISTORY_PAGE_SIZE_DEFAULT = 20;

export function useAppData(
  options: { historyPageSize?: number } = {},
): AppData {
  const pageSize = options.historyPageSize ?? HISTORY_PAGE_SIZE_DEFAULT;
  const [profile, setProfile] = useState<ExtensionProfile>(defaultProfile());
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ProfileSyncStatus | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const refreshHistory = useCallback(async (): Promise<void> => {
    try {
      setHistory(await listHistory(pageSize));
    } catch {
      // History view degrades to empty if IndexedDB is unavailable; the
      // toggle still works and the underlying writes will succeed once
      // the store recovers. Surfacing this would be noise.
      setHistory([]);
    }
  }, [pageSize]);

  useEffect(() => {
    void (async () => {
      const p = await loadProfile();
      setProfile(p);
      setLoaded(true);
      if (p.historyEnabled) {
        await refreshHistory();
      }
      try {
        setSyncStatus(await getSyncStatus());
      } catch {
        setSyncStatus(null);
      }
    })();
  }, [refreshHistory]);

  // Live history updates while the surface (popup or tab) is open.
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return undefined;
    }
    const handler = (msg: unknown): void => {
      if (!isHistoryUpdatedMessage(msg)) return;
      if (!profile.historyEnabled) return;
      void refreshHistory();
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [profile.historyEnabled, refreshHistory]);

  // Pick up profile saves originating from sibling surfaces (another
  // popup window, or the tab while the popup is also open).
  useEffect(() => {
    if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
      return undefined;
    }
    const handler = (msg: unknown): void => {
      if (!isProfileUpdatedMessage(msg)) return;
      setProfile(msg.profile);
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const update = useCallback(
    async (patch: Partial<ExtensionProfile>): Promise<void> => {
      try {
        const outcome = await saveProfileWithOutcome(patch);
        setProfile(outcome.profile);
        if (outcome.error) {
          setSaveError(outcome.error);
        } else {
          setSaveError((prev) => (prev === null ? prev : null));
        }
      } catch (cause: unknown) {
        const msg = cause instanceof Error ? cause.message : "Save failed";
        setSaveError(msg);
      }
    },
    [],
  );

  const dismissSaveError = useCallback((): void => {
    setSaveError(null);
  }, []);

  const clearAllHistory = useCallback(async (): Promise<void> => {
    try {
      await clearHistory();
      await refreshHistory();
    } catch (cause: unknown) {
      const msg = cause instanceof Error ? cause.message : "Clear failed";
      setSaveError(msg);
    }
  }, [refreshHistory]);

  return {
    profile,
    history,
    loaded,
    syncStatus,
    saveError,
    update,
    dismissSaveError,
    refreshHistory,
    clearAllHistory,
  };
}
