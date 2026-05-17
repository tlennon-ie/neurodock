# @neurodock/docs

The NeuroDock documentation site. Built with [Astro Starlight](https://starlight.astro.build/). Published at `docs.neurodock.org`.

## Quick start

From the repository root:

```bash
pnpm install
pnpm --filter @neurodock/docs run dev
```

The site is available at `http://localhost:4321/`.

To produce a static build:

```bash
pnpm --filter @neurodock/docs run build
```

Output goes to `docs/dist/`.

## Layout

```
docs/
├── astro.config.mjs Starlight integration, sidebar
├── package.json @neurodock/docs, Astro deps
├── public/
│ ├── favicon.svg
│ └── fonts/ Atkinson Hyperlegible, Lexend, JetBrains Mono (not committed)
├── src/
│ ├── assets/ logo placeholder
│ ├── content/
│ │ ├── config.ts Starlight content collection schema
│ │ └── docs/
│ │ ├── index.mdx Landing
│ │ ├── manifesto.mdx
│ │ ├── ethics.mdx
│ │ ├── getting-started/
│ │ ├── concepts/
│ │ ├── reference/
│ │ │ ├── mcp-servers/
│ │ │ └── skills/
│ │ ├── decisions/ ADR mirror pages
│ │ └── contribute/
│ └── styles/
│ ├── tokens.css Design tokens (colour, type, motion)
│ └── overrides.css Starlight theme overrides
└── tsconfig.json
```

## Design tokens

Pinned by :

- **Body:** Atkinson Hyperlegible.
- **Headings:** Lexend.
- **Code:** JetBrains Mono.
- **Colour modes:** calm light, dim dark. No gradients. Single neutral accent hue.
- **Motion:** none by default. `prefers-reduced-motion: reduce` honoured strictly.
- **Line-height:** ≥ 1.65 in body.

Font binaries are not committed. See `public/fonts/README.md` for download sources and SIL Open Font License attribution requirements.

## Architecture decision records

Canonical ADR markdown lives at the repository root under `docs/decisions/`. The pages under `src/content/docs/decisions/` are short in-site summaries that link to those canonical files.

## Source-of-truth content

These pages mirror canonical artefacts that live elsewhere:

| Page | Canonical source |
|---|---|
| `manifesto.mdx` | (until `MANIFESTO.md` is published at repo root) |
| `ethics.mdx` | (until `ETHICS.md` is published at repo root) |
| `contribute/overview.mdx` | /(until `CONTRIBUTING.md` is published at repo root) |

| `decisions/0001-*.mdx` … `0004-*.mdx` | `docs/decisions/000*-*.md` |
| `reference/skills/*.mdx` | `packages/skills/<name>/SKILL.md` |
| `reference/mcp-servers/*.mdx` | `packages/<server>/schemas/*.schema.json` |

If you update a canonical source, update its mirror page in the same PR. The doc-writer agent's quality gates require it.

## Conventions

- One concept per page. A page that explains three things explains zero things well.
- Show, then explain. Every API reference starts with an example.
- Front-load. The first sentence of every page states what the reader will be able to do after reading.
- No emoji in body copy.
- No "TODO" or "coming soon" left behind. If it's not written, it doesn't exist in the docs.

## License

AGPL-3.0-or-later, matching the rest of the repository.
