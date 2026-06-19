---
"@neurodock/native-host": patch
---

fix(native-host): only emit valid Chrome ids into the Chromium manifest's allowed_origins

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
