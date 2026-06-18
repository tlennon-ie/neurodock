---
"@neurodock/extension-browser": patch
---

fix(extension-browser): pin the onboarding full-setup command to @latest

The Power-Up card / onboarding slide showed `npx @neurodock/cli setup`,
which reuses whatever older copy npx already cached — often one that
predates the `setup` subcommand, so it fails with "unknown command
'setup'". The advertised command is now `npx @neurodock/cli@latest setup`,
forcing npx to resolve the current published version (matching the
`@latest` form the docs already use).
