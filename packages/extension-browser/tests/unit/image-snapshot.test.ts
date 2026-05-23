/**
 * imageSnapshot — covers the null-return paths the SW relies on for its
 * graceful fallback to the URL-fetch path.
 *
 * jsdom does not implement a real Canvas 2D context, so `getContext`
 * returns null and `toDataURL` either throws or returns a 1x1 blank
 * PNG depending on version. We don't try to assert the happy-path data
 * URL here — that's a browser-only behaviour — but we DO verify that
 * unsupported / missing-element cases resolve to null cleanly so the
 * SW's `await tryImageSnapshot(...) ?? imageUrl` fallback works.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { snapshotImageToDataUrl } from "../../entrypoints/_shared/imageSnapshot.js";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("snapshotImageToDataUrl", () => {
  it("returns null when no <img> matches the supplied URL", async () => {
    const result = await snapshotImageToDataUrl(
      "https://example.com/missing.png",
    );
    expect(result).toBeNull();
  });

  it("returns null when the matched <img> has not loaded", async () => {
    const img = document.createElement("img");
    img.src = "https://example.com/never-loads.png";
    document.body.appendChild(img);
    // naturalWidth === 0 in jsdom because the image is never fetched.
    const result = await snapshotImageToDataUrl(
      "https://example.com/never-loads.png",
    );
    expect(result).toBeNull();
  });
});
