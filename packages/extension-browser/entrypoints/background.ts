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

  // IMPORTANT: this listener must stay synchronous up to the
  // `chrome.permissions.request` call. MV3 service workers consume the
  // user-gesture context at the first `await`, after which
  // `permissions.request` is rejected with "must be called during a user
  // gesture" and never prompts. 0.0.18 had an `async (info, tab) => { ...
  // await ensureImageHostPermission ... }` shape which silently broke the
  // permission prompt — the user got `IMAGE_PERMISSION_DENIED` with no
  // way to grant. 0.0.19 restructures to callback-style permission
  // request, then delegates to an async runner.
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab?.id) return;
    const tabId = tab.id;
    const url = tab.url ?? "";
    const channel = detectChannelFromUrl(url);

    if (info.menuItemId === CONTEXT_MENU_ID) {
      const text =
        typeof info.selectionText === "string" ? info.selectionText : "";
      if (text.length === 0) return;
      // Return the dispatch promise so tests that await
      // `contextMenus.onClicked._invoke(...)` get a settled result. Chrome
      // ignores the return value of context-menu listeners; this is a
      // test-seam convenience, not a behavioural contract change.
      return dispatchContextResult(
        tabId,
        url,
        channel,
        {
          tool: "translate_incoming",
          input: { text, channel },
          channel,
        },
        text,
      ) as unknown as void;
    }

    if (info.menuItemId === CONTEXT_MENU_IMAGE_ID) {
      const imageUrl = typeof info.srcUrl === "string" ? info.srcUrl : "";
      if (imageUrl.length === 0) return;
      const origin = imageOriginFor(imageUrl);

      // data: URL or unparseable — skip the host-permission check entirely.
      if (origin === null) {
        void dispatchImageTranslate(tabId, url, channel, imageUrl);
        return;
      }

      // Sync `chrome.permissions.request` preserves the user gesture
      // because we have NOT awaited anything yet. The callback fires
      // immediately with `granted: true` when permission already exists,
      // otherwise it prompts. No `contains` pre-check — that would
      // consume the gesture before the request landed.
      const permsApi = getPermissionsApi();
      if (!permsApi) {
        // Permissions API unavailable (tests / unusual context) — just
        // run the translate and let downstream fetch errors surface.
        void dispatchImageTranslate(tabId, url, channel, imageUrl);
        return;
      }
      permsApi.request({ origins: [origin] }, (granted) => {
        if (!granted) {
          void sendImagePermissionDenied(tabId, url, channel, imageUrl);
          return;
        }
        void dispatchImageTranslate(tabId, url, channel, imageUrl);
      });
      return;
    }
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
      await appendHistory({
        id: `${response.timestamp}-${response.tool}`,
        tool: response.tool,
        channel: request.channel ?? null,
        timestamp: response.timestamp,
        mode: profile.mode,
        mockMode: response.mockMode,
        provider: response.provenance.provider,
        inputPreview: buildInputPreview(request),
        outputSummary: summariseOutput(response),
        // 0.0.21: persist the full request+response so the popup
        // History tab can render the actual structured result, not
        // just a "describe_image · ok" summary line. Sanitised below
        // to drop massive base64 image data URLs the canvas snapshot
        // produces — keeping the original URL is enough for the
        // History row's source-preview line, and the full data URL
        // would balloon the IndexedDB store.
        request: sanitiseRequestForHistory(request),
        response,
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

/**
 * One-line input preview for the History list row. Text translations
 * truncate the selected text; image translations show the image URL
 * (so the user can tell which image a row belongs to without expanding
 * it). The full structured input is kept separately on the `request`
 * field for the expanded view.
 */
function buildInputPreview(request: TranslationRequest): string {
  const input = request.input as Record<string, unknown>;
  if (typeof input.text === "string" && input.text.length > 0) {
    return truncatePreview(input.text);
  }
  if (typeof input.image_url === "string" && input.image_url.length > 0) {
    // Data URLs (canvas snapshots) blow past the 256-char preview cap.
    // Show a stable marker instead so the History row stays compact.
    if (input.image_url.startsWith("data:")) {
      return "[snapshot] (rendered via canvas; original URL on the row)";
    }
    return truncatePreview(input.image_url);
  }
  if (typeof input.transcript === "string" && input.transcript.length > 0) {
    return truncatePreview(input.transcript);
  }
  return "";
}

/**
 * Drop oversized inline data from the request before we persist it.
 * Canvas-snapshot data URLs can be hundreds of kB — storing them in
 * IndexedDB would balloon the History store fast. We replace the data
 * URL with a short marker and rely on the `inputPreview` showing the
 * original page-side image URL the user actually right-clicked.
 */
function sanitiseRequestForHistory(
  request: TranslationRequest,
): TranslationRequest {
  const input = request.input as Record<string, unknown>;
  if (
    typeof input.image_url === "string" &&
    input.image_url.startsWith("data:")
  ) {
    return {
      ...request,
      input: {
        ...input,
        image_url: "[snapshot]",
      },
    };
  }
  return request;
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
async function notifyContextResultFallback(
  response: TranslationResponse,
  pageUrl: string,
): Promise<void> {
  // Read the live profile so the "open History" suggestion is only shown
  // when History is actually ON. Pre-0.0.21 the toast told users to
  // check History unconditionally; for users who had History off the
  // tab was empty by design and the message looked broken.
  let historyEnabled = false;
  try {
    const profile = await loadProfile();
    historyEnabled = profile.historyEnabled;
  } catch {
    // Profile read failure means we can't tell — fall back to the
    // "turn on History" branch which is a safe non-promise either way.
  }
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
  // Only point the user at History when History is actually ON — otherwise
  // they open a History tab that's empty by design and quite reasonably
  // conclude the feature is broken.
  const okSuffix = historyEnabled
    ? "Open the popup → Home → History and click the latest row to read it."
    : "Turn on History in the popup → Home if you want the result kept around.";
  const message = ok
    ? `Done${where}. NeuroDock's panel can't open on this site (no host ` +
      `permission). ${okSuffix}`
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
 * 0.0.19: helper extracts the `<scheme>://<host>/*` pattern from an
 * image URL for use with chrome.permissions.request. Returns null for
 * data: URLs (no host to grant) and for unparseable strings.
 */
function imageOriginFor(imageUrl: string): string | null {
  if (imageUrl.startsWith("data:")) return null;
  try {
    const u = new URL(imageUrl);
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}

interface PermissionsApi {
  readonly request: (
    perm: { origins: string[] },
    cb: (granted: boolean) => void,
  ) => void;
}

function getPermissionsApi(): PermissionsApi | null {
  const g = globalThis as unknown as {
    chrome?: { permissions?: PermissionsApi };
  };
  return g.chrome?.permissions ?? null;
}

async function dispatchImageTranslate(
  tabId: number,
  pageUrl: string,
  channel: ReturnType<typeof detectChannelFromUrl>,
  imageUrl: string,
): Promise<void> {
  // 0.0.20: prefer the content-script canvas snapshot over the original
  // URL. The page already has the decoded image bytes in memory, so a
  // snapshot bypasses three failure modes the URL path can't recover
  // from: (a) the URL requires auth the SW doesn't have, (b) the URL
  // returned an SVG most vision models can't read, (c) the URL is a
  // short-lived signed link that has expired between page load and
  // right-click. The snapshot returns a base64 PNG data URL that drops
  // straight into the existing image-pipeline.
  //
  // Falls back silently to the original URL when:
  //   - no content-script island is mounted on this tab (URL outside
  //     declared host_permissions) — `sendMessage` rejects
  //   - the canvas is CORS-tainted — `toDataURL` throws SecurityError
  //   - no matching `<img>` element is found on the page
  // ...so the existing 0.0.17 URL-fetch path remains the safety net.
  const effectiveImageUrl =
    (await tryImageSnapshot(tabId, imageUrl)) ?? imageUrl;
  await dispatchContextResult(
    tabId,
    pageUrl,
    channel,
    {
      tool: "describe_image",
      input: { image_url: effectiveImageUrl, page_url: pageUrl },
      channel,
    },
    imageUrl, // keep the original URL for the in-panel SourcePreview
  );
}

/**
 * Ask the content-script island to snapshot the right-clicked image
 * via `<canvas>.toDataURL`. Returns null when the snapshot path is
 * unavailable (no island, tainted canvas, image not yet loaded), in
 * which case the caller falls back to fetching the URL directly.
 */
async function tryImageSnapshot(
  tabId: number,
  imageUrl: string,
): Promise<string | null> {
  const tabsApi = (globalThis as { chrome?: typeof chrome }).chrome?.tabs;
  if (!tabsApi?.sendMessage) return null;
  try {
    const response = (await tabsApi.sendMessage(tabId, {
      type: "image:snapshot",
      imageUrl,
    })) as { dataUrl?: unknown } | undefined;
    if (response && typeof response.dataUrl === "string") {
      return response.dataUrl;
    }
    return null;
  } catch {
    // No content-script island (out-of-scope URL), tab gone, or
    // listener threw. Caller falls back to the URL path.
    return null;
  }
}

async function sendImagePermissionDenied(
  tabId: number,
  pageUrl: string,
  channel: ReturnType<typeof detectChannelFromUrl>,
  imageUrl: string,
): Promise<void> {
  const response: TranslationResponse = {
    ok: false,
    tool: "describe_image",
    data: null,
    error:
      "IMAGE_PERMISSION_DENIED: NeuroDock needs permission to read this " +
      "image's host (so it can fetch + base64-encode it for your vision " +
      "model). You can either (a) right-click again and accept the per-host " +
      "prompt, or (b) open the popup → Settings → Enable image translation " +
      "to grant access to every site at once.",
    mockMode: false,
    provenance: { mode: "unknown", provider: "none", model: "none" },
    timestamp: new Date().toISOString(),
  };
  void chrome.tabs
    .sendMessage(tabId, {
      type: "neurodock:context-result",
      response,
      sourceText: imageUrl,
      channel,
    })
    .catch(() => {
      void notifyContextResultFallback(response, pageUrl);
    });
}

async function dispatchContextResult(
  tabId: number,
  pageUrl: string,
  channel: ReturnType<typeof detectChannelFromUrl>,
  request: TranslationRequest,
  sourceText: string,
): Promise<void> {
  const response = await runTranslate(request);
  // Targeted at the tab's content-script island (mounted by gmail.content.ts
  // and the other per-site bootstraps). The island listens for this exact
  // discriminated `type` and opens the result panel.
  //
  // P1.4 from the audit: if the user right-clicks on a page OUTSIDE the
  // 9 declared `host_permissions`, no content script is mounted, the
  // sendMessage rejects with "Could not establish connection. Receiving
  // end does not exist." and the user previously saw nothing. Fall back
  // to a `chrome.notifications` toast.
  void chrome.tabs
    .sendMessage(tabId, {
      type: "neurodock:context-result",
      response,
      sourceText,
      channel,
    })
    .catch(() => {
      void notifyContextResultFallback(response, pageUrl);
    });
}
