---
"@neurodock/extension-browser": patch
---

fix(extension): declare nativemessaging so the native host can connect

"full neurodock" never connected for any user. the manifest never declared the
`nativeMessaging` permission, so `chrome.runtime.connectNative` was undefined and
`probeNativeHost` silently reported "not connected" without ever launching the
host. that is why clicking "check again" produced no network / console / service
worker activity, while `neurodock doctor` — which spawns the launcher directly
and bypasses chrome — passed.

the permission is declared in `optional_permissions` (not `permissions`) and
requested at runtime on the "turn on full neurodock" / "check again" user gesture
via `chrome.permissions.request`, so a plain install shows no native-messaging
warning. the auto-poll stays non-interactive and never prompts; the grant
persists across restarts. verified against chrome, firefox 115+, and edge
(`nativeMessaging` is requestable as an optional permission on all three).
