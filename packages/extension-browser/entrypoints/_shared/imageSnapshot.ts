/**
 * Image-snapshot handler for content-script islands.
 *
 * Listens for `{type: "image:snapshot", imageUrl}` from the service
 * worker, locates the matching `<img>` on the page, and returns a base64
 * PNG `data:` URL via the sendResponse callback.
 *
 * Why this exists (0.0.20):
 *
 *   - Direct URL fetches in the SW fail for auth-gated CDNs (private
 *     repos, signed S3 URLs that have expired by the time we fetch).
 *   - SVGs technically fetch fine but most vision models can't read raw
 *     SVG bytes — we'd be sending the model garbage.
 *   - For any rendered image, the browser already has the decoded pixel
 *     buffer in memory. Drawing to a canvas and exporting as PNG gives
 *     us a guaranteed-vision-model-compatible payload with no network
 *     round-trip.
 *
 * Limitations (returns null, SW falls back to URL fetch path):
 *
 *   - Cross-origin images served without `Access-Control-Allow-Origin`
 *     taint the canvas; `toDataURL` throws `SecurityError`. The image
 *     would need a `crossorigin="anonymous"` attribute AND the server
 *     would need to return CORS headers for the canvas to stay clean.
 *     We can't retroactively reload the image with the attribute set
 *     without also reloading the page, which would be a hostile thing
 *     to do mid-translation.
 *   - Images that haven't finished loading (`naturalWidth === 0`) —
 *     unusual for an image the user just right-clicked, but possible
 *     during slow connections.
 *   - No matching `<img>` (e.g. CSS background-image, which Chrome's
 *     context-menu does fire for, but `info.srcUrl` differs from any
 *     queryable selector — handled as a TODO).
 *
 * In every "returns null" case the SW falls back to the original
 * 0.0.17 URL-fetch path so behaviour degrades gracefully.
 */

interface ImageSnapshotMessage {
  readonly type: "image:snapshot";
  readonly imageUrl: string;
}

function isImageSnapshotMessage(msg: unknown): msg is ImageSnapshotMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as { type?: unknown; imageUrl?: unknown };
  return m.type === "image:snapshot" && typeof m.imageUrl === "string";
}

export function installImageSnapshotHandler(): () => void {
  if (typeof chrome === "undefined" || !chrome.runtime?.onMessage) {
    return () => undefined;
  }
  const listener = (
    msg: unknown,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: { dataUrl: string | null }) => void,
  ): boolean => {
    if (!isImageSnapshotMessage(msg)) return false;
    void snapshotImageToDataUrl(msg.imageUrl).then((dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true; // async response — keep the channel open
  };
  chrome.runtime.onMessage.addListener(listener);
  return () => chrome.runtime.onMessage.removeListener(listener);
}

/**
 * Locate the `<img>` element matching `imageUrl` and export it as a
 * base64 PNG `data:` URL. Returns null when the element isn't found,
 * isn't loaded, or the canvas is cross-origin tainted.
 *
 * Element-match logic: try exact-string match on `currentSrc` first
 * (post-srcset resolution), then `src`. Chrome's `info.srcUrl` in the
 * context-menu callback is the resolved URL the user actually saw, so
 * `currentSrc` is the highest-fidelity match.
 */
export async function snapshotImageToDataUrl(
  imageUrl: string,
): Promise<string | null> {
  const target = findImageElement(imageUrl);
  if (target === null) return null;
  if (!target.complete || target.naturalWidth === 0) {
    // Wait briefly in case the image is still decoding. After ~500ms
    // give up rather than block the translation indefinitely.
    const ready = await waitForLoad(target, 500);
    if (!ready) return null;
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = target.naturalWidth;
    canvas.height = target.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (ctx === null) return null;
    ctx.drawImage(target, 0, 0);
    // toDataURL throws SecurityError on a CORS-tainted canvas. We catch
    // and return null so the SW falls back to the URL-fetch path
    // (which has the SW's host_permissions and CAN cross the CORS line).
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function findImageElement(imageUrl: string): HTMLImageElement | null {
  const imgs = Array.from(document.querySelectorAll("img"));
  for (const img of imgs) {
    if (img.currentSrc === imageUrl) return img;
  }
  for (const img of imgs) {
    if (img.src === imageUrl) return img;
  }
  return null;
}

function waitForLoad(
  img: HTMLImageElement,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (img.complete && img.naturalWidth > 0) {
      resolve(true);
      return;
    }
    let settled = false;
    const cleanup = (result: boolean): void => {
      if (settled) return;
      settled = true;
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      resolve(result);
    };
    const onLoad = (): void => cleanup(img.naturalWidth > 0);
    const onError = (): void => cleanup(false);
    img.addEventListener("load", onLoad, { once: true });
    img.addEventListener("error", onError, { once: true });
    setTimeout(() => cleanup(false), timeoutMs);
  });
}
