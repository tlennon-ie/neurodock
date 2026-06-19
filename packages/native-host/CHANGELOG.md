# @neurodock/native-host

## 0.3.2

### Patch Changes

- 9f57d2d: fix(native-host): only emit valid Chrome ids into the Chromium manifest's allowed_origins

  the chromium native-messaging manifest listed BOTH the published Chrome id and
  the Firefox gecko id as `chrome-extension://<id>/` origins. chrome validates
  every `allowed_origins` entry against `chrome-extension://[a-p]{32}/` and rejects
  the ENTIRE manifest if any entry is malformed — so the gecko id
  (`neurodock-extension@neurodock.org`) made chrome report "specified native
  messaging host not found", and full neurodock never connected on ANY chromium
  browser (chrome/edge/brave/chromium/vivaldi), on any OS. the manifest file
  existed and `neurodock doctor` passed because it reads the file directly and
  spawns the launcher, never validating origins the way chrome does.

  fix: classify ids and emit each only where it is valid — `buildManifest`
  (chromium) keeps only `[a-p]{32}` ids; `buildFirefoxManifest` keeps only gecko
  ids (`name@domain` or `{uuid}`). also expose `findInvalidChromiumOrigins` so the
  cli `doctor` can flag a manifest chrome would reject. users on a chromium
  browser must re-run `neurodock host install` to rewrite the manifest.

## 0.3.1

### Patch Changes

- b574263: fix(native-host): report the real package version over ping and --version

  the host hardcoded "0.1.0" for both the native-messaging `ping` response and the
  `neurodock-native-host --version` flag, so it advertised a stale version on every
  build (e.g. `neurodock doctor` reported "version 0.1.0" against a 0.3.0 host).
  `HOST_VERSION` now derives from package.json — baked into the staged bundle at
  build time via an esbuild `define` (the staged copy has no real package.json to
  read), with a `createRequire` fallback for the tsc/dev/test path. no behaviour
  change beyond the reported version string.

## 0.3.0

### Minor Changes

- 0580c6f: fix: stage the native host to a stable dir and launch it via a real launcher

  The native-messaging host never actually connected end-to-end — the browser
  extension showed "Not connected yet" despite correct extension ids and a green
  `neurodock doctor`. Three defects, every one hitting all users:

  1. The manifest `path` pointed at `@neurodock/native-host/dist/cli.js` resolved
     relative to the running CLI. Under the documented `npx @neurodock/cli@latest
setup` that lands in npm's `_npx` cache, which npm prunes and rotates — so
     the manifest eventually pointed at a deleted file.
  2. The manifest `path` was a bare `.js`. Chrome on Windows cannot launch a
     `.js` as a native-messaging host (it needs a `.bat`/`.cmd`/`.exe`), blocking
     every Windows user.
  3. Chrome launches the host with the calling extension's origin as the first
     CLI arg, but `parseArgs` only ran the stdio host when argv was empty or the
     first arg was literally `run`; any other first arg printed help and
     disconnected — so even a successful launch greeted Chrome with usage text.

  Fix (coordinated across `@neurodock/native-host` and `@neurodock/cli`):

  - Install now STAGES a self-contained copy of the runtime into a stable
    per-user directory (`%APPDATA%\NeuroDock\native-host\runtime\` on Windows,
    `~/Library/Application Support/NeuroDock/native-host/runtime/` on macOS,
    `$XDG_DATA_HOME/neurodock/native-host/runtime/` on Linux) and points the
    manifest at a LAUNCHER there — a `.bat` on Windows, a `#!/bin/sh` wrapper on
    macOS/Linux — that embeds the absolute `node` binary and forces the `run`
    subcommand before forwarding Chrome's args. `dist/cli.js` is now bundled
    (ajv/yaml inlined), so the relocated copy resolves zero bare imports and
    survives the `_npx` cache being pruned.
  - `parseArgs` routes any unrecognised first arg (a `chrome-extension://` /
    `moz-extension://` origin, `--parent-window=`) to `run`, not help.
  - `neurodock doctor` and `neurodock-native-host doctor` verify the
    ALREADY-INSTALLED host: they read the on-disk Chromium manifest, resolve the
    launcher `path` Chrome would actually run, and spawn exactly that — exchanging
    a `ping`/pong over the length-prefixed stdio protocol. They never re-stage or
    re-register, so the diagnostic reflects the user's real install (a missing
    manifest, or a manifest pointing at a pruned `_npx` launcher, FAILS with a
    "run `neurodock host install`" hint instead of being silently repaired). On
    macOS/Linux the `0755` `.sh` launcher is spawned directly (`shell: false`);
    only the Windows `.bat` uses the shell.
  - Uninstall removes the staged runtime directory too (no orphans).

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
