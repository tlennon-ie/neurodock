/**
 * Shared bootstrap for all per-site content scripts.
 *
 * The per-site scripts call `bootstrapContent({ channel, hostId, matches })`
 * with their channel id; this module handles:
 *   - Loading the profile via runtime.sendMessage (we cannot import the
 *     storage module directly in content scripts that need profile data
 *     fresh — content scripts go through the service worker).
 *   - Mounting the React island into a Shadow Root.
 *   - Sending translation requests to the service worker.
 *   - Listening for context-menu result broadcasts.
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

  void requestProfile();

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

  render();
  // Re-render after profile arrives.
  void requestProfile().then(render);

  return () => island.destroy();
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
