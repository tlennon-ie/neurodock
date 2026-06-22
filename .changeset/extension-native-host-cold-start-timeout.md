---
"@neurodock/extension-browser": patch
---

fix(extension): give the native-host ping a realistic cold-start timeout and surface the reason

after granting the nativemessaging permission the host still showed "not
connected". chrome spawns a FRESH host process for every `connectNative`, so
every probe is a cold start (cmd.exe → node → the ~600 KB bundle, frequently
with windows defender scanning the spawn) that routinely needs 1–3 s. the ping
cap was 1 s, so it timed out before a healthy host could pong — while
`neurodock doctor` (8 s cap) passed, which is why the two disagreed. raise the
cap to 5 s to match the host's real cold-start latency. also surface the probe's
failure reason under the card (instead of a silent "not connected yet") and show
a "checking…" state while probing, and skip overlapping auto-polls.
