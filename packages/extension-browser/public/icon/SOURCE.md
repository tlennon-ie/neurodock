# NeuroDock extension icons

## Source

The canonical glyph is [`docs/public/favicon.svg`](../../../../docs/public/favicon.svg).
The full wordmark (logo + word "NeuroDock") lives at
[`docs/src/assets/logo.png`](../../../../docs/src/assets/logo.png) and is rendered
in the popup / tab headers — it is NOT what becomes the toolbar PNGs.

Per the visual-identity-refresh design contract: do NOT design a derivative
glyph. The favicon SVG is the single source of truth.

## Generation pipeline (preferred)

Regenerate every `{16,32,48,128,256}.png` from the SVG with ImageMagick.
Background transparent. Safe area = 12.5% padding inside the bounding box
(the SVG already builds the rounded-rect bezel with a margin, so a flat
resize keeps the safe area correct without extra padding flags).

```bash
cd packages/extension-browser
magick ../../docs/public/favicon.svg -background none -resize 256x256 public/icon/256.png
magick ../../docs/public/favicon.svg -background none -resize 128x128 public/icon/128.png
magick ../../docs/public/favicon.svg -background none -resize 48x48   public/icon/48.png
magick ../../docs/public/favicon.svg -background none -resize 32x32   public/icon/32.png
magick ../../docs/public/favicon.svg -background none -resize 16x16   public/icon/16.png
```

Verify with `file public/icon/*.png` — each should report the correct
pixel dimensions and `8-bit/color RGBA`.

## 16×16 legibility note

The current favicon glyph is a 28×28 stroked rounded rectangle with a
12×12 filled inner square (see `docs/public/favicon.svg`). At 16×16
the 2-pixel stroke survives but the inner square loses crispness because
the SVG was authored at a 32-unit grid. If the 16×16 toolbar render
looks muddy after regeneration, consider:

1. Authoring a dedicated 16-grid SVG glyph (a Maintainer-level decision
   per the design contract — do not derive one ad-hoc).
2. Adding a `-filter point` flag to the ImageMagick `magick` invocation
   for the 16×16 render to force nearest-neighbour scaling and preserve
   pixel edges.

The status quo (resize-from-32-grid SVG) is acceptable; the inner
square is recognisable. Document any future change here.

## When ImageMagick is not available

The PNGs currently checked in are the legacy 0.0.30-and-earlier renders
of the same favicon SVG produced on a previous machine that had
ImageMagick. The visual-identity refresh keeps them in place rather
than ship a regression. A Maintainer with ImageMagick should run the
pipeline above and commit the refreshed PNGs in the same release as a
follow-up.

## Background and palette

Transparent background. The glyph uses `#2e3a5e` (deep slate-blue)
which is close to but not identical to the design-system accent
(`oklch(45% 0.05 250)` → roughly `#3b4a6f`). The hard-coded hex inside
the SVG is intentional: the favicon is rendered on third-party surfaces
(Chrome toolbar, browser tabs in light/dark mode, the docs site nav)
where CSS custom properties from `tokens.css` cannot be inherited.
Replacing the hex is a Maintainer-level decision.
