---
"@neurodock/cli": patch
---

fix(cli): doctor flags a native-host manifest Chrome would reject

`neurodock doctor` only spawned the launcher and exchanged a ping/pong, which
passes even when chrome refuses the host because the manifest's
`allowed_origins` contains an entry chrome rejects (e.g. a firefox gecko id
wedged into a `chrome-extension://` origin) — the exact false PASS that hid the
connectivity bug. doctor now also validates the installed chromium manifest via
`findInvalidChromiumOrigins` and FAILs with the offending entries and the
remedy (update `@neurodock/native-host` and re-run `neurodock host install`).
