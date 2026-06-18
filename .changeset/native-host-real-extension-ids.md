---
"@neurodock/cli": patch
"@neurodock/native-host": patch
---

fix(native-host): register the real published extension ids so the extension can connect

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
