# @neurodock/native-host

## 0.2.1

### Patch Changes

- a7c3f01: fix(native-host): register the real published extension ids so the extension can connect

  The native-messaging host was registered with the literal placeholder
  `__NEURODOCK_EXTENSION_ID__`, which was never substituted — so the host
  manifest's `allowed_origins` matched no extension and the browser
  extension always showed "Not connected yet" even after a successful
  `setup`/`install-all`.

  - The published Chrome Web Store id (`lcdaiekokkgniiknejddojkfkoiinopo`)
    and the Firefox gecko id (`neurodock-extension@neurodock.org`) are now
    the registered defaults (`PUBLISHED_EXTENSION_IDS` /
    `withDefaultExtensionIds` in `@neurodock/native-host`), so a
    store-installed extension connects out of the box.
  - `neurodock setup` and `neurodock install-all` gained a repeatable
    `--extension-id <id>` flag, threaded down to the host installer, so a
    locally-loaded unpacked build (whose id differs from the published one)
    can be allowed in one command. Provided ids are unioned with the
    published defaults and deduped.

## 0.2.0 - 2026-06-11

### Added — `ping` reports setup capabilities

The `ping` response `data` now carries a `capabilities` object — the
"fully set up" contract the browser extension's power-up card consumes:

- `profile: true` — the host can read/write profile.yaml (always true
  when the host responds at all).
- `hooks` — NeuroDock guardrail hook entries are present in
  `~/.claude/settings.json` (the merge target of
  `neurodock install-hooks`).
- `daemon` — the standalone daemon's user-login autostart marker exists
  (HKCU Run value `NeuroDockGuardrail` on Windows, LaunchAgent plist on
  macOS, systemd --user unit on Linux). The daemon _script_ on disk is
  deliberately not a marker — `install-hooks` copies it even when the
  daemon was never enabled.

Additive and backwards compatible: `{ pong, version }` are unchanged,
so clients that ignore `capabilities` keep working. Detection lives in
`src/capabilities.ts` with injectable fs/os/registry probes for tests,
and mirrors the markers `neurodock guardrail status` checks.

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
