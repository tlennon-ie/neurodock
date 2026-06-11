# Bundled font licenses

All font files in this directory ship under the SIL Open Font License 1.1.
We bundle them so the extension does not need a network round-trip and
the look matches the docs site (`docs/src/styles/tokens.css`).

| File                                   | Family                | Upstream                                     |
| -------------------------------------- | --------------------- | -------------------------------------------- |
| atkinson-hyperlegible-400.woff2        | Atkinson Hyperlegible | https://github.com/braille-institute         |
| atkinson-hyperlegible-400-italic.woff2 | Atkinson Hyperlegible | https://github.com/braille-institute         |
| atkinson-hyperlegible-700.woff2        | Atkinson Hyperlegible | https://github.com/braille-institute         |
| lexend-variable.woff2                  | Lexend Variable       | https://github.com/googlefonts/lexend        |
| jetbrains-mono-variable.woff2          | JetBrains Mono        | https://github.com/JetBrains/JetBrainsMono   |
| opendyslexic-400.woff2                 | OpenDyslexic          | https://github.com/antijingoist/opendyslexic |
| opendyslexic-700.woff2                 | OpenDyslexic          | https://github.com/antijingoist/opendyslexic |
| comic-neue-400.woff2                   | Comic Neue            | https://github.com/crozynski/comicneue       |
| comic-neue-700.woff2                   | Comic Neue            | https://github.com/crozynski/comicneue       |

Files copied from `docs/node_modules/@fontsource/atkinson-hyperlegible/files/`,
`docs/node_modules/@fontsource-variable/{lexend,jetbrains-mono}/files/`,
`docs/node_modules/@fontsource/opendyslexic/files/`, and
`docs/node_modules/@fontsource/comic-neue/files/`.
We only copy the `latin` (and where applicable `wght`) subsets because the
extension UI is English-only at present.

If you regenerate, also update the SHA in `scripts/sync-fonts.ts` once
that script exists. Until then the source of truth is the @fontsource
packages installed under `docs/`.

The OFL text is reproduced under each upstream repository. The license
permits redistribution as part of derived software, with the requirement
that the font itself stays under OFL — which it does here.
