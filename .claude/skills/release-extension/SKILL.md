---
name: release-extension
description: Walk through cutting a browser-extension release — bump manifest, build for Chrome / Firefox / Edge, zip artefacts, optionally run E2E, submit to stores.
---

# release-extension

A checklist for releasing `packages/extension-browser/` to the Chrome Web
Store, Firefox Add-ons (AMO), and Edge Add-ons. The extension is `private`
in `package.json` so the npm-side semver still matters for in-repo
tooling; the actual user-facing artefacts are the per-browser zips.

The `release-pilot` agent owns the broader release coordination; this
skill is the contributor-facing checklist.

## When to use

- After a PR has been merged that warrants a new extension release
  (UX-visible bug fix, new feature, signed message-format change).
- When `version-impact` flagged the extension as needing a bump.

## Prerequisites

- The bump kind decision (`major` / `minor` / `patch`) — run
  `version-impact` first.
- Chrome Web Store, AMO, and Edge dashboards credentials kept out of the
  repo.
- `pnpm` available; node version per the root `.nvmrc` (if present).

## What it does

Walks the seven release steps in order. The skill lists them; the
contributor executes them.

### 1. Bump the version

Edit `packages/extension-browser/package.json` and update `version`.
The build step propagates this into the per-browser `manifest.json`.

### 2. Update the CHANGELOG

Append to `packages/extension-browser/CHANGELOG.md`:

```markdown
## <new-version> — YYYY-MM-DD

### Added / Changed / Fixed

- ...
```

One line per bullet, plain factual ND-readable copy.

### 3. Run the build for each target

```bash
pnpm --filter @neurodock/extension-browser build:chrome
pnpm --filter @neurodock/extension-browser build:firefox
pnpm --filter @neurodock/extension-browser build:edge
```

Each command produces a target-specific bundle under
`packages/extension-browser/dist/<target>/`.

### 4. Zip the artefacts

```bash
pnpm --filter @neurodock/extension-browser zip
```

Produces `packages/extension-browser/dist/neurodock-<target>-<version>.zip`
for each browser.

### 5. Run E2E (if available)

```bash
pnpm --filter @neurodock/extension-browser test:e2e
```

The E2E suite exercises the side-panel, popup, right-click translate, and
the native-host bridge. Recent regressions (commits `615c54a`, `f948e63`)
were caught by manual Gmail testing — automate them here when the suite
grows.

### 6. Tag the release

```bash
git tag extension-browser/<new-version>
git push origin extension-browser/<new-version>
```

### 7. Submit to stores

For each browser, upload the matching zip via the relevant dashboard:

- Chrome Web Store — Developer Dashboard
- Firefox Add-ons (AMO) — Developer Hub
- Edge Add-ons — Partner Center

Each store does its own review; expect 1–7 days. Track status with
`release-pilot`.

## Post-release

- Confirm install from each store on a clean profile before announcing.
- Update screenshots in `packages/extension-browser/store/` if the UI
  changed.
- Note the version in the root `CHANGELOG.md` under the next repo-wide
  release entry.

## Limitations

- Store reviews are out of our control. A blocked review needs human
  follow-up; the skill cannot resolve it.
- The skill assumes the build scripts above exist; if a target is added
  or removed, update both `package.json` and this checklist.
- No automated upload to stores in v0.1.0 — every submission is manual.
- The `release-pilot` agent owns rollout comms; this skill stops at
  "submitted".

## Voice

Treat this as a procedure. List the steps; do not editorialise about how
exciting the release is. If a step fails (build, zip, E2E, store upload),
stop and surface the exact error — do not paper over it.
