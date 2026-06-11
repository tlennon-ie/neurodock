# Publishing the browser extension to the web stores

CI publishes the extension to the Chrome Web Store, Firefox Add-ons (AMO),
and Microsoft Edge Add-ons automatically when an `extension-browser@X.Y.Z`
tag is pushed. The publish job lives in
[`.github/workflows/extension.yml`](../../.github/workflows/extension.yml)
and submits via `wxt submit` (a thin wrapper around the
[`publish-browser-extension`](https://www.npmjs.com/package/publish-browser-extension)
CLI).

## The release flow

1. Bump `version` in `packages/extension-browser/package.json` (and the
   package `CHANGELOG.md`).
2. Merge to `main`.
3. Tag and push:

   ```sh
   git tag extension-browser@X.Y.Z
   git push --tags
   ```

CI then:

- builds the extension for Chrome, Firefox, and Edge;
- verifies the tag version matches `package.json` (the job fails with a
  clear message if they disagree);
- zips each browser bundle (`pnpm --filter @neurodock/extension-browser zip`);
- submits each zip to every store whose secrets are configured;
- attaches all zips to a GitHub release named after the tag.

A manual run is also possible from the Actions tab: pick the
"Browser extension" workflow, "Run workflow", and tick the **publish**
input. That path skips the tag check and does not create a GitHub
release — it submits whatever version is on the selected commit.

## Graceful skipping

Each store step is guarded: if any of that store's secrets are missing or
empty, the step is skipped with a notice
("chrome publish skipped: secrets not configured") and the job still
succeeds. If no store is configured at all, the run emits a warning but
still attaches the zips to the GitHub release. This means the tag-driven
flow is safe to use before any store credentials exist.

## Secrets

All secrets are configured in the GitHub repository settings under
**Settings → Secrets and variables → Actions**. Names follow the
`publish-browser-extension` convention (verified against v4.0.5, which is
what WXT 0.20 resolves).

| Secret                 | Store   | Where to obtain it                                                                                                                           |
| ---------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `CHROME_EXTENSION_ID`  | Chrome  | The 32-character id in the Chrome Web Store listing URL (`chromewebstore.google.com/detail/...../<id>`).                                     |
| `CHROME_CLIENT_ID`     | Chrome  | Google Cloud console: create a project, enable the **Chrome Web Store API**, then create an **OAuth client ID** (type: Desktop app).         |
| `CHROME_CLIENT_SECRET` | Chrome  | Same OAuth client as above.                                                                                                                  |
| `CHROME_REFRESH_TOKEN` | Chrome  | Run `npx publish-extension init` locally — the wizard walks the OAuth consent flow with your client id/secret and prints the refresh token.  |
| `FIREFOX_EXTENSION_ID` | Firefox | The add-on UUID or the `browser_specific_settings.gecko.id` from the AMO listing (Developer Hub → your add-on → "Manage Status & Versions"). |
| `FIREFOX_JWT_ISSUER`   | Firefox | AMO Developer Hub → [Manage API Keys](https://addons.mozilla.org/developers/addon/api/key/) — the "JWT issuer" value.                        |
| `FIREFOX_JWT_SECRET`   | Firefox | Same API-keys page — the "JWT secret" value.                                                                                                 |
| `EDGE_PRODUCT_ID`      | Edge    | Microsoft Partner Center → your extension → the **Product ID** on the overview page.                                                         |
| `EDGE_CLIENT_ID`       | Edge    | Partner Center → Account settings → **Publish API** → enable the API and copy the client id.                                                 |
| `EDGE_API_KEY`         | Edge    | Same Publish API page — generate an API key. (This is the current API-key flow; the older v1.1 client-secret flow is not used.)              |

A store is treated as configured only when **all** of its secrets are
non-empty.

## First submission must be manual

Every store requires the first listing to be created by hand — the
publish APIs can only update an existing listing:

- **Chrome**: upload an initial zip in the
  [developer dashboard](https://chrome.google.com/webstore/devconsole),
  fill in the listing, and get it through review once. The extension id
  only exists after this.
- **Firefox**: submit the first version through the
  [AMO Developer Hub](https://addons.mozilla.org/developers/). AMO review
  may ask for the sources zip; CI uploads it alongside the build on
  subsequent submissions.
- **Edge**: create the product in
  [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/)
  and submit the first package manually. The product id only exists after
  this.

Until a store's first listing exists (and its secrets are added), CI
simply skips that store and notes it in the job log.

## Notes

- Submissions go to each store's normal review queue; "published by CI"
  still means "pending review" until the store approves it.
- The zips CI submits are also attached to the GitHub release for the
  tag, so the exact submitted artefacts are always auditable.
- `publish-browser-extension` supports extra knobs (Chrome publish
  target, Firefox channel, skipping review submission). They are not
  wired into the workflow; add the matching env vars to the publish
  steps in `extension.yml` if ever needed.
