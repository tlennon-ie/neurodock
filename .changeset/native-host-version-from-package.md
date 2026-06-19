---
"@neurodock/native-host": patch
---

fix(native-host): report the real package version over ping and --version

the host hardcoded "0.1.0" for both the native-messaging `ping` response and the
`neurodock-native-host --version` flag, so it advertised a stale version on every
build (e.g. `neurodock doctor` reported "version 0.1.0" against a 0.3.0 host).
`HOST_VERSION` now derives from package.json — baked into the staged bundle at
build time via an esbuild `define` (the staged copy has no real package.json to
read), with a `createRequire` fallback for the tsc/dev/test path. no behaviour
change beyond the reported version string.
