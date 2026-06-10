// Rasterise the store-listing SVG placeholders to the exact PNG sizes each
// store requires (submission-checklist.md Phase 3). Run from repo root:
//   node packages/extension-browser/store-listings/assets/rasterise.mjs
// Uses sharp (already a workspace build dependency). SVGs are rendered at a
// high density first so upscales (e.g. the 300x300 Edge logo from a 128px
// icon) stay crisp, then resized to the exact target dimensions.
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// sharp is a transitive dep installed under the docs workspace; resolve it from
// there (pnpm keeps it out of the hoisted root node_modules).
const repoRoot = join(here, "..", "..", "..", "..");
const require = createRequire(join(repoRoot, "docs", "package.json"));
const sharp = require("sharp");

// [source svg, width, height, output png]
const jobs = [
  ["promo-tile-440x280.svg", 440, 280, "promo-tile-440x280.png"],
  ["promo-tile-920x680.svg", 920, 680, "promo-tile-920x680.png"],
  ["promo-tile-1400x560.svg", 1400, 560, "promo-tile-1400x560.png"],
  ["icon-128.svg", 128, 128, "icon-128.png"],
  // Edge store logo: rasterise the icon at 300x300.
  ["icon-128.svg", 300, 300, "edge-logo-300x300.png"],
];

for (const [src, w, h, out] of jobs) {
  await sharp(join(here, src), { density: 384 })
    .resize(w, h, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(join(here, out));
  console.log(`wrote ${out} (${w}x${h})`);
}
