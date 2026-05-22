/**
 * Service worker (Manifest V3 background).
 *
 * Responsibilities:
 *   - Register the right-click "Translate selection" context menu.
 *   - Route translation requests from content scripts + popup through the
 *     single translation-client.ts boundary.
 *   - Record local-only history when the user has opted in.
 *
 * Service workers are stateless (per the agent operating manual): always
 * re-hydrate from chrome.storage / IndexedDB on wake. Do not assume any
 * module-level cache survives.
 */
import { defineBackground } from "wxt/utils/define-background";
import { loadProfile } from "../src/lib/profile.js";
import {
  translate,
  detectChannelFromUrl,
} from "../src/lib/translation-client.js";
import { appendHistory, truncatePreview } from "../src/lib/storage.js";
import type {
  RuntimeMessage,
  RuntimeResponseEnvelope,
  TranslationRequest,
  TranslationResponse,
} from "../src/lib/types.js";

const CONTEXT_MENU_ID = "neurodock-translate-selection";

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_ID,
        title: "NeuroDock: translate selection",
        contexts: ["selection", "editable"],
      },
      () => {
        // Swallow chrome.runtime.lastError so re-install does not log noise.
        // (createContextMenu errors if the id already exists.)
        void chrome.runtime.lastError;
      },
    );
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== CONTEXT_MENU_ID) return;
    if (!tab?.id) return;
    const text =
      typeof info.selectionText === "string" ? info.selectionText : "";
    if (text.length === 0) return;
    const url = tab.url ?? "";
    const channel = detectChannelFromUrl(url);
    const request: TranslationRequest = {
      tool: "translate_incoming",
      input: { text, channel },
      channel,
    };
    const response = await runTranslate(request);
    chrome.tabs.sendMessage(tab.id, {
      type: "neurodock:context-result",
      response,
    });
  });

  chrome.runtime.onMessage.addListener(
    (
      msg: RuntimeMessage,
      _sender,
      sendResponse: (env: RuntimeResponseEnvelope) => void,
    ) => {
      if (!msg || msg.type !== "translate") return false;
      void (async () => {
        try {
          const data = await runTranslate(msg.request);
          sendResponse({ success: true, data, error: null });
        } catch (error: unknown) {
          sendResponse({
            success: false,
            data: null,
            error: getErrorMessage(error),
          });
        }
      })();
      return true; // async response
    },
  );
});

async function runTranslate(
  request: TranslationRequest,
): Promise<TranslationResponse> {
  const profile = await loadProfile();
  const response = await translate(request, { profile });
  if (profile.historyEnabled) {
    try {
      const inputPreview =
        typeof request.input.text === "string"
          ? truncatePreview(request.input.text)
          : "";
      await appendHistory({
        id: `${response.timestamp}-${response.tool}`,
        tool: response.tool,
        channel: request.channel ?? null,
        timestamp: response.timestamp,
        mode: profile.mode,
        mockMode: response.mockMode,
        provider: response.provenance.provider,
        inputPreview,
        outputSummary: summariseOutput(response),
      });
    } catch {
      // History writes never block translation; swallow failures here.
    }
  }
  return response;
}

function summariseOutput(response: TranslationResponse): string {
  if (!response.ok) return response.error ?? "error";
  if (response.mockMode) return "mock";
  return "ok";
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}
