# Fonts

NeuroDock vendors three font families via `@fontsource` npm packages
(SIL Open Font License 1.1). The CSS lives in `src/styles/tokens.css`
and imports directly from the packages — Astro/Vite then bundles the
woff2 files into `/_astro/` with content-hashed filenames at build time.

There is nothing to drop into this directory. It exists so the URL
`/fonts/` resolves with a friendly README rather than a 404.

## Font families used

- **Atkinson Hyperlegible** (`@fontsource/atkinson-hyperlegible`) — body
  copy. Designed by the Braille Institute for low-vision and
  dyslexia-friendly reading. The font-hinting dropdown in the docs
  header (see `src/overrides/SiteTitle.astro`) defaults to this family.
- **Lexend** (`@fontsource-variable/lexend`) — headings, and an opt-in
  body alternative via the font-hinting dropdown. Designed by Bonnie
  Shaver-Troup for proficiency and ND readability.
- **JetBrains Mono** (`@fontsource-variable/jetbrains-mono`) — code samples.

All three packages are SIL Open Font License 1.1.

## SIL Open Font License attribution

If you redistribute a NeuroDock docs build, the OFL requires:

1. The OFL licence text accompanies the font files. Each `@fontsource`
   package ships its OFL `LICENSE` file in `node_modules/<pkg>/`.
2. The fonts are not sold on their own.
3. Reserved Font Names are not used for derivative works.
