/**
 * @license AGPL-3.0-or-later
 *
 * 0.0.35 — SourcePreview must render an image source as a clickable
 * thumbnail (opening the full image in a new tab), not a raw URL string.
 *
 * The motivating bug: a `describe_image` history row whose source was a
 * LinkedIn CDN URL like
 * `https://media.licdn.com/dms/image/v2/…/1775633530817?e=…&v=beta`
 * rendered as a monospaced URL blob. The URL has no file extension, so
 * the old extension-only heuristic never treated it as an image. The
 * `isImageSource` hint (set by callers that KNOW the source is an image)
 * fixes that.
 */
import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { SourcePreview } from "../../entrypoints/_shared/panel.js";

const EXTENSIONLESS_CDN_URL =
  "https://media.licdn.com/dms/image/v2/D4D10AQGIu3orMpx8fA/" +
  "ads-document-images_800/B4DZ1sAUjWG0Ac-/2/1775633530817?e=1781136000&v=beta&t=abc";

describe("SourcePreview — image thumbnails", () => {
  it("renders an extension-less image URL as a thumbnail when isImageSource is set", () => {
    render(<SourcePreview text={EXTENSIONLESS_CDN_URL} isImageSource />);
    const img = screen.getByTestId(
      "source-image-thumbnail",
    ) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe(EXTENSIONLESS_CDN_URL);
  });

  it("wraps the thumbnail in a link that opens the image in a new tab", () => {
    render(<SourcePreview text={EXTENSIONLESS_CDN_URL} isImageSource />);
    const link = screen.getByTestId("source-image-link") as HTMLAnchorElement;
    expect(link).toBeInTheDocument();
    expect(link.getAttribute("href")).toBe(EXTENSIONLESS_CDN_URL);
    expect(link.getAttribute("target")).toBe("_blank");
    // rel must defang the opened tab (no window.opener back-reference).
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.getAttribute("rel")).toContain("noreferrer");
  });

  it("does NOT render the raw URL as a code string when it is shown as an image", () => {
    const { container } = render(
      <SourcePreview text={EXTENSIONLESS_CDN_URL} isImageSource />,
    );
    // The user asked for a thumbnail INSTEAD OF the URL — no <code> blob.
    expect(container.querySelector("code")).toBeNull();
  });

  it("still detects extension-based image URLs without the hint (back-compat)", () => {
    render(<SourcePreview text="https://example.com/avatar.png" />);
    expect(screen.getByTestId("source-image-thumbnail")).toBeInTheDocument();
    expect(screen.getByTestId("source-image-link")).toBeInTheDocument();
  });

  it("renders a non-image URL as a plain URL string, never a broken <img>", () => {
    // A text selection that happens to be a URL, with no image hint.
    render(<SourcePreview text="https://example.com/some/article" />);
    expect(screen.queryByTestId("source-image-thumbnail")).toBeNull();
    expect(
      screen.getByText("https://example.com/some/article"),
    ).toBeInTheDocument();
  });

  it("renders a data: image as an un-linked thumbnail (Chrome blocks data: navigation)", () => {
    const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB";
    render(<SourcePreview text={dataUrl} isImageSource />);
    expect(screen.getByTestId("source-image-thumbnail")).toBeInTheDocument();
    // No link wrapper for data: sources — an inert link would be misleading.
    expect(screen.queryByTestId("source-image-link")).toBeNull();
  });

  it("renders plain text (non-URL) verbatim", () => {
    render(<SourcePreview text="let's circle back on this Q3" />);
    expect(screen.queryByTestId("source-image-thumbnail")).toBeNull();
    expect(
      screen.getByText("let's circle back on this Q3"),
    ).toBeInTheDocument();
  });
});
