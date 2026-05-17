# Fonts

The NeuroDock docs site references three font families (per ):

- **Atkinson Hyperlegible** — body copy. Designed by the Braille Institute for low-vision and dyslexia-friendly reading.
- **Lexend** — headings. Designed by Bonnie Shaver-Troup for proficiency and ND readability.
- **JetBrains Mono** — code samples.

All three are SIL Open Font License 1.1 and are free to redistribute under that licence.

## Expected files in this directory

The CSS `@font-face` declarations in `src/styles/tokens.css` expect these filenames:

```
atkinson-hyperlegible-regular.woff2
atkinson-hyperlegible-italic.woff2
atkinson-hyperlegible-bold.woff2
lexend-variable.woff2
jetbrains-mono-variable.woff2
```

## Download sources

- Atkinson Hyperlegible: https://www.brailleinstitute.org/freefont/
- Lexend (variable): https://github.com/googlefonts/lexend
- JetBrains Mono (variable): https://github.com/JetBrains/JetBrainsMono

## Why the font files are not committed

The repository deliberately ships only its own code and content. Font binaries are pulled in at build time by a separate provisioning step (or by maintainers running `pnpm fonts:fetch` once that script lands). Until then, Starlight will fall back to system fonts and the layout will still render.

## SIL Open Font License attribution

If you redistribute a NeuroDock docs build, the SIL OFL requires:

1. The OFL licence text accompanies the font files.
2. No attempt is made to sell the fonts on their own.
3. Reserved Font Names are not used for derivative works.

The OFL licence text is included with each upstream download.
