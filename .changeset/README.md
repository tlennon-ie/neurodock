# Changesets

This directory is managed by [Changesets](https://github.com/changesets/changesets). Every user-facing change should ship with a changeset describing what changed and at what semver level (patch/minor/major).

## Adding a changeset

```bash
pnpm changeset
```

Pick the affected packages, the bump type, and write a short, contributor-friendly summary. The file is committed alongside your code change.

## Versioning model

- Independent versioning per package.
- Internal cross-package bumps default to `patch`.
- Public access (`access: public`) — packages publish under `@neurodock/*` once we have npm + PyPI namespaces live.
