/**
 * Shared bootstrap for all per-site content scripts.
 *
 * The per-site scripts call `bootstrapContent({ channel, hostId, matches })`
 * with their channel id; this module handles:
 *   - Loading the profile via `chrome.runtime.sendMessage({ type: "profile:get" })`
 *     to the service worker, which is the source of truth.
 *   - Re-loading the profile when `chrome.storage.onChanged` fires for the
 *     profile key (i.e. the popup saved a change).
 *   - Mounting the React island into a Shadow Root.
 *   - Sending translation requests to the service worker.
 *   - The right-click context-menu result listener lives inside
 *     `ContentApp` itself (registered there for proper React unmount
 *     cleanup).
 *
 * Pre-0.0.8 the profile request had no listener on the background side,
 * so every island silently ran with `defaultProfile()` for the life of
 * the tab. Fixed in 0.0.8 by adding the `profile:get` handler in
 * `background.ts` AND a `chrome.storage.onChanged` listener here so
 * popup saves propagate to open islands without manual reload.
 */
import React from "react";
import { mountIsland } from "./mountIsland.js";
import { ContentApp } from "./contentApp.js";
import { defaultProfile } from "../../src/lib/profile.js";
import type {
  Channel,
  ExtensionProfile,
  RuntimeResponseEnvelope,
  TranslationRequest,
  TranslationResponse,
} from "../../src/lib/types.js";

const PROFILE_STORAGE_KEY = "neurodock.profile.v1";

export interface BootstrapOptions {
  readonly channel: Channel;
  readonly hostId: string;
}

export function bootstrapContent(options: BootstrapOptions): () => void {
  const island = mountIsland(options.hostId);
  let profile: ExtensionProfile = defaultProfile();

  const requestProfile = async (): Promise<ExtensionProfile> => {
    try {
      const res = await sendMessage<ExtensionProfile>({
        type: "profile:get",
      });
      if (res) profile = res;
      return profile;
    } catch {
      return profile;
    }
  };

  const requestTranslate = async (
    request: TranslationRequest,
  ): Promise<TranslationResponse | null> => {
    try {
      const env = await chrome.runtime.sendMessage<
        unknown,
        RuntimeResponseEnvelope
      >({
        type: "translate",
        request,
      });
      if (!env.success || !env.data) return null;
      return env.data;
    } catch {
      return null;
    }
  };

  const render = (): void => {
    island.root.render(
      <ContentApp
        channel={options.channel}
        profile={profile}
        requestTranslate={requestTranslate}
      />,
    );
  };

  // Initial render with defaults so the island is at least mounted while
  // the profile fetch is in flight.
  render();

  // Re-render after profile arrives.
  void requestProfile().then(render);

  // Subscribe to profile updates from the popup. `chrome.storage.local.set`
  // automatically fires `chrome.storage.onChanged` to every context that
  // has a listener — so when the user changes provider / mode / API key
  // in the popup, every open island re-renders with fresh state without
  // needing a manual tab reload.
  const storageListener = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== "local") return;
    if (!Object.prototype.hasOwnProperty.call(changes, PROFILE_STORAGE_KEY)) {
      return;
    }
    void requestProfile().then(render);
  };

  if (chrome?.storage?.onChanged?.addListener) {
    chrome.storage.onChanged.addListener(storageListener);
  }

  return (): void => {
    if (chrome?.storage?.onChanged?.removeListener) {
      chrome.storage.onChanged.removeListener(storageListener);
    }
    island.destroy();
  };
}

async function sendMessage<T>(payload: unknown): Promise<T | null> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return null;
  }
  try {
    const result = await chrome.runtime.sendMessage<unknown, T>(payload);
    return result ?? null;
  } catch {
    return null;
  }
}
