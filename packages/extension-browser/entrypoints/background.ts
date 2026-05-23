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
import { fetchModels } from "../src/lib/providers/models.js";
import { appendHistory, truncatePreview } from "../src/lib/storage.js";
import type {
  RuntimeMessage,
  RuntimeResponseEnvelope,
  TranslationRequest,
  TranslationResponse,
} from "../src/lib/types.js";

const CONTEXT_MENU_ID = "neurodock-translate-selection";
const CONTEXT_MENU_IMAGE_ID = "neurodock-describe-image";

export function registerHandlers(): void {
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
    // 0.0.14+: right-click an image to get a structured description.
    // Requires a vision-capable cloud model (gpt-4o-mini, claude-haiku-4-5,
    // openrouter/auto routes to one). Local providers reject loudly with
    // VISION_MODEL_REQUIRED so the user knows to switch modes.
    chrome.contextMenus.create(
      {
        id: CONTEXT_MENU_IMAGE_ID,
        title: "NeuroDock: describe image (vision)",
        contexts: ["image"],
      },
      () => {
        void chrome.runtime.lastError;
      },
    );
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab?.id) return;
    const url = tab.url ?? "";
    const channel = detectChannelFromUrl(url);

    let request: TranslationRequest | null = null;
    let sourceText = "";

    if (info.menuItemId === CONTEXT_MENU_ID) {
      const text =
        typeof info.selectionText === "string" ? info.selectionText : "";
      if (text.length === 0) return;
      request = {
        tool: "translate_incoming",
        input: { text, channel },
        channel,
      };
      sourceText = text;
    } else if (info.menuItemId === CONTEXT_MENU_IMAGE_ID) {
      const imageUrl = typeof info.srcUrl === "string" ? info.srcUrl : "";
      if (imageUrl.length === 0) return;
      // 0.0.18: request optional host permission for the image's origin
      // BEFORE running the translate. This is a user-gesture context
      // (the user just clicked the menu item) so chrome.permissions.request
      // is allowed to prompt. Without this, the LM Studio / Ollama lane
      // fetches the image from the SW and fails with a CSP / permission
      // error the user can't act on. Granted hosts stick until revoked
      // from Settings → Host permissions.
      const granted = await ensureImageHostPermission(imageUrl);
      if (!granted) {
        const response: TranslationResponse = {
          ok: false,
          tool: "describe_image",
          data: null,
          error:
            "IMAGE_PERMISSION_DENIED: NeuroDock needs permission to read " +
            "this image's host to send it to your vision model. Click the " +
            "right-click menu item again and grant access when prompted.",
          mockMode: false,
          provenance: {
            mode: "unknown",
            provider: "none",
            model: "none",
          },
          timestamp: new Date().toISOString(),
        };
        void chrome.tabs
          .sendMessage(tab.id, {
            type: "neurodock:context-result",
            response,
            sourceText: imageUrl,
            channel,
          })
          .catch(() => {
            notifyContextResultFallback(response, url);
          });
        return;
      }
      request = {
        tool: "describe_image",
        input: { image_url: imageUrl, page_url: url },
        channel,
      };
      // Source preview for the image path is the URL — the in-page panel's
      // ImageDescribeView shows a thumbnail rendered from this URL.
      sourceText = imageUrl;
    } else {
      return;
    }

    const response = await runTranslate(request);
    // Targeted at the tab's content-script island (mounted by gmail.content.ts
    // and the other per-site bootstraps). The island listens for this exact
    // discriminated `type` and opens the result panel.
    //
    // P1.4 from the audit: if the user right-clicks on a page OUTSIDE the
    // 9 declared `host_permissions`, no content script is mounted, the
    // sendMessage rejects with "Could not establish connection. Receiving
    // end does not exist." and the user previously saw nothing — the
    // translation succeeded silently into IndexedDB. Fall back to a
    // `chrome.notifications` toast so the user gets confirmation AND a
    // hint about where the result is.
    void chrome.tabs
      .sendMessage(tab.id, {
        type: "neurodock:context-result",
        response,
        sourceText,
        channel,
      })
      .catch(() => {
        notifyContextResultFallback(response, url);
      });
  });

  chrome.runtime.onMessage.addListener(
    (msg: RuntimeMessage, _sender, sendResponse: (env: unknown) => void) => {
      if (!msg) return false;
      if (msg.type === "translate") {
        void (async () => {
          try {
            const data = await runTranslate(msg.request);
            sendResponse({
              success: true,
              data,
              error: null,
            } satisfies RuntimeResponseEnvelope);
          } catch (error: unknown) {
            sendResponse({
              success: false,
              data: null,
              error: getErrorMessage(error),
            } satisfies RuntimeResponseEnvelope);
          }
        })();
        return true; // async response
      }
      if (msg.type === "models:fetch") {
        // 0.0.16: proxy model-list fetches through the service worker so
        // local-LLM endpoints that don't send Access-Control-Allow-Origin
        // (LM Studio, plain Ollama) work from the popup. The SW has
        // host_permissions for the configured origin and bypasses CORS;
        // the popup's `chrome-extension://...` origin does not.
        void (async () => {
          try {
            const models = await fetchModels({
              provider: msg.provider,
              ...(msg.baseUrl ? { baseUrl: msg.baseUrl } : {}),
              ...(msg.apiKey ? { apiKey: msg.apiKey } : {}),
            });
            sendResponse({
              success: true,
              models,
              error: null,
            });
          } catch (error: unknown) {
            sendResponse({
              success: false,
              models: null,
              error: getErrorMessage(error),
            });
          }
        })();
        return true; // async response
      }
      if (msg.type === "profile:get") {
        // Pre-0.0.8 this handler did not exist. Content-script islands
        // sent `profile:get` from bootstrap.tsx, got `undefined` back,
        // hit the bare catch, and silently ran with `defaultProfile()`
        // for the life of the tab — meaning the in-page panel's
        // cloud-mode banner reflected defaults rather than the user's
        // actual settings (privacy-transparency bug).
        void (async () => {
          try {
            const profile = await loadProfile();
            sendResponse(profile);
          } catch {
            // Profile read failed (corrupted storage, native-host
            // crash). Return null so the content-script keeps its
            // defaultProfile() — the popup will surface the underlying
            // issue the next time the user opens Settings.
            sendResponse(null);
          }
        })();
        return true; // async response
      }
      return false;
    },
  );
}

export default defineBackground(() => registerHandlers());

export async function runTranslate(
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
      // Notify the popup (if open) so its history list refreshes live.
      // The popup mounts once and used to never repaint, leaving users
      // staring at a stale list after a fresh translation completed.
      // sendMessage rejects if no receiver (popup closed) — that is fine.
      void chrome.runtime
        .sendMessage({ type: "history:updated" })
        .catch(() => undefined);
    } catch {
      // History writes never block translation. IndexedDB unavailability
      // or a transient transaction error here would otherwise lose the
      // translation result altogether; instead the user still gets the
      // in-page panel + notification and only the History tab is empty.
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

/**
 * P1.4 fallback path. Called when the right-click translate completes but
 * the active tab has no content-script island (the URL is outside the 9
 * declared host_permissions). We deliberately keep the message short —
 * notifications are a non-blocking surface and shouldn't carry the full
 * translation payload. The user can find the full result in the popup's
 * History tab if `historyEnabled` is on.
 */
function notifyContextResultFallback(
  response: TranslationResponse,
  pageUrl: string,
): void {
  const g = globalThis as unknown as {
    chrome?: {
      notifications?: {
        create?: (
          opts: {
            type: string;
            iconUrl: string;
            title: string;
            message: string;
            priority?: number;
          },
          cb?: (id: string) => void,
        ) => void;
      };
    };
  };
  const create = g.chrome?.notifications?.create;
  if (!create) return;
  const ok = response.ok && !response.mockMode;
  const title = ok
    ? "NeuroDock — translation ready"
    : response.mockMode
      ? "NeuroDock — mock fallback"
      : "NeuroDock — translation error";
  const host = safeHost(pageUrl);
  const where = host ? ` on ${host}` : "";
  const message = ok
    ? `Done${where}. NeuroDock's panel can't open on this site (no host ` +
      `permission). Open the popup → Home → History to read the result.`
    : response.mockMode
      ? `Configured provider was unreachable${where}; mock answered instead. Check popup → Settings → Test.`
      : `Could not translate${where}. ${response.error ?? "Unknown error"}.`;
  try {
    create({
      type: "basic",
      iconUrl: "icon/128.png",
      title,
      message,
      priority: 1,
    });
  } catch {
    // notifications.create can throw if the icon path resolves outside
    // the extension at runtime. We have nothing better to fall back to
    // here — the user can still find the result in popup History.
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
}

/**
 * 0.0.18: request optional host_permission for the origin of an image URL
 * so the SW can fetch + base64-encode it for local-LLM vision models.
 * Called from inside the contextMenus.onClicked handler which preserves
 * the user-gesture timing chrome.permissions.request needs to prompt.
 *
 * Returns true when permission already exists OR was just granted; false
 * when the user denied or the URL is unparseable. data: URLs always
 * return true (no host to request).
 */
async function ensureImageHostPermission(imageUrl: string): Promise<boolean> {
  if (imageUrl.startsWith("data:")) return true;
  let origin: string;
  try {
    const u = new URL(imageUrl);
    origin = `${u.protocol}//${u.host}/*`;
  } catch {
    return false;
  }
  const g = globalThis as unknown as {
    chrome?: {
      permissions?: {
        contains?: (
          perm: { origins: string[] },
          cb: (has: boolean) => void,
        ) => void;
        request?: (
          perm: { origins: string[] },
          cb: (granted: boolean) => void,
        ) => void;
      };
    };
  };
  const perms = g.chrome?.permissions;
  if (!perms?.contains || !perms?.request) return true; // tests / no API
  const alreadyHas = await new Promise<boolean>((resolve) => {
    perms.contains!({ origins: [origin] }, (has) => resolve(has));
  });
  if (alreadyHas) return true;
  return new Promise<boolean>((resolve) => {
    perms.request!({ origins: [origin] }, (granted) => resolve(granted));
  });
}
