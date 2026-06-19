---
"@neurodock/native-host": minor
"@neurodock/cli": minor
---

fix: stage the native host to a stable dir and launch it via a real launcher

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
