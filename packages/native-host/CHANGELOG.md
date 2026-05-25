# @neurodock/native-host

## [unreleased]

### Security — registration scaffolds use atomic writes

`registerLinux`, `registerDarwin`, and `writeProfile` (profile-io) previously called
`existsSync` to probe a path and then wrote to that path in a separate `writeFileSync`
call, leaving a TOCTOU race window. All three sites now use `atomicWriteOverwrite`
from `src/util/atomic-write.ts`: content is written to a unique `.pid.ts.tmp` sibling
and renamed into place, which is atomic on POSIX. For `writeProfile` the existing
read-merge logic is preserved — data is merged before the rename, so no existing
profile content is lost. The helper is encapsulated in `src/util/atomic-write.ts`
and shared by both registration modules.

## 0.1.0

### Added

- First release. Implements the Chrome Native Messaging length-prefixed
  protocol so the browser extension can read and write
  `~/.neurodock/profile.yaml` directly instead of maintaining a duplicate
  in `chrome.storage.local`.
- `neurodock-native-host install` / `uninstall` bin. Registers the host
  with Chrome, Chromium, Brave, Edge, Vivaldi, and Firefox on macOS,
  Linux, and Windows.
- Per-platform manifest dispatch in
  `src/registration/{darwin,linux,windows}.ts`.
- Ajv-driven schema validation against
  `packages/core/schemas/profile.schema.json` before any disk write.
- YAML round-trip via the `yaml` package's `parseDocument` API so
  hand-written comments survive a `set` from the extension (matches the
  CLI behaviour from ADR 0004 §14).
- Vitest suite: protocol round-trip, handler dispatch, profile I/O
  precedence, manifest builders.

### Manual smoke per platform

These are run before release; they are not in CI because they touch the
user's real browser config.

1. `pnpm --filter @neurodock/native-host build`
2. `node packages/native-host/dist/cli.js install --extension-id $ID`
3. Launch Chrome / Edge / Brave / Firefox, open the extension popup, and
   confirm the settings tab shows `Profile sync: native host (active)`.
4. Edit `display_name` in the popup → confirm
   `~/.neurodock/profile.yaml` is updated and comments survive.
5. `node packages/native-host/dist/cli.js uninstall` → confirm the popup
   falls back to `Profile sync: extension-local`.
