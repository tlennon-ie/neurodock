# @neurodock/native-host

Chrome Native Messaging host that exposes `~/.neurodock/profile.yaml` to
the NeuroDock browser extension. Eliminates v0.0.1 drift between the
extension's `chrome.storage.local` profile and the CLI's on-disk profile.

The host is OPTIONAL. The extension continues to work in extension-local
mode when the host is not installed; the popup surfaces a one-line
status indicator and a banner inviting the user to install it.

## Status

v0.1.0 — initial release. Supports macOS, Linux, and Windows. Wired for
Chrome, Chromium, Brave, Edge, Vivaldi, and Firefox.

## Protocol

Length-prefixed JSON over stdio, per the
[Chrome Native Messaging spec](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).
Every frame: a 32-bit little-endian unsigned length, then a UTF-8 JSON
body. Chrome's 1 MB per-message cap is enforced in both directions.

Request shape:

```jsonc
{
  "op": "get" | "set" | "ping",
  "id": "client-correlation-id (optional)",
  "payload": { /* profile, required for set */ },
  "confirmOverwrite": false
}
```

Response shape:

```jsonc
{
  "ok": true,
  "op": "get",
  "id": "...",
  "data": { "path": "/Users/.../profile.yaml", "exists": true, "profile": { ... } },
  "error": null,
  "version": "0.1.0"
}
```

Error envelopes set `ok: false` and put `CODE: message` in `error`.
Codes used in v0.1.0: `BAD_REQUEST`, `BAD_PAYLOAD`, `SCHEMA_INVALID`,
`CONFIRM_REQUIRED`, `READ_FAILED`, `WRITE_FAILED`, `UNKNOWN_OP`,
`MESSAGE_TOO_LARGE`, `INVALID_JSON`.

## Install

```bash
# Once the package is published to npm:
pnpx @neurodock/native-host install --extension-id <ID>

# From a fresh monorepo clone:
pnpm --filter @neurodock/native-host build
node packages/native-host/dist/cli.js install --extension-id <ID>
```

Per-platform manifest locations:

| Platform | Manifest |
|---|---|
| macOS | `~/Library/Application Support/<browser>/NativeMessagingHosts/com.neurodock.profile.json` |
| Linux | `$XDG_CONFIG_HOME/<browser>/NativeMessagingHosts/com.neurodock.profile.json` (Firefox uses `~/.mozilla/native-messaging-hosts/`) |
| Windows | Manifest JSON under `%APPDATA%\NeuroDock\native-host\`; registry pointer under `HKCU\Software\<browser>\NativeMessagingHosts\com.neurodock.profile` (via `reg.exe`) |

Uninstall removes every manifest and registry pointer the install step
created.

## Profile path precedence

Matches the loader documented in `packages/core/schemas/profile.schema.json`:

1. `$NEURODOCK_PROFILE_PATH`
2. `$XDG_CONFIG_HOME/neurodock/profile.yaml`
3. `~/.neurodock/profile.yaml`

## Safety

- Profile writes are validated against the canonical
  `profile.schema.json` before touching disk.
- When the on-disk profile contains fields the extension does not own
  (anything outside `identity`), a `set` call without
  `confirmOverwrite: true` returns `CONFIRM_REQUIRED` instead of
  clobbering the file. The popup surfaces this to the user.
- The host never runs as a daemon. Chrome launches it on demand and it
  exits when stdin closes.
- No telemetry. No remote calls. No logging of profile contents.

## License

AGPL-3.0-or-later.
