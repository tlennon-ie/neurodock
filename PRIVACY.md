# Privacy policy — NeuroDock

**Last reviewed:** 2026-05-21
**Applies to:** the NeuroDock substrate as a whole — the six Python MCP
servers, the `@neurodock/cli` installer, the optional native messaging
host, the curated profiles and plugins shipped in this repo, and any
data NeuroDock stores on your machine while running.
**Source of truth for this policy:** this file, in the NeuroDock monorepo
at [`PRIVACY.md`](./PRIVACY.md). If a docs page or store listing ever
says something different, this file wins.

The browser extension has its own, more detailed policy at
[`packages/extension-browser/PRIVACY.md`](./packages/extension-browser/PRIVACY.md)
because browser extensions sit at a different trust boundary (they touch
web pages and can talk to LLM providers directly). The two policies are
consistent; the extension one is more specific.

This policy is written in plain English. We try to keep legal hedging
out of the way of the actual claims, because the people we build for
read a lot of opaque consent prose every day and we will not add to
that pile.

---

## TL;DR

- NeuroDock is **local-first by default**. Your profile lives in
  `~/.neurodock/profile.yaml`. Your cognitive-graph memories live in a
  local SQLite database at `~/.neurodock/cognitive-graph.sqlite`.
  Sessions, decisions, and other state stay on your machine.
- **Nothing leaves your machine** unless you explicitly opt in to a
  cloud LLM provider in the browser extension. The MCP servers and CLI
  make zero outbound network calls in the default install.
- **No telemetry. No analytics. No crash reporting. No fingerprinting.**
  There is no NeuroDock account, no sign-in, no NeuroDock server in the
  middle of anything.
- To wipe everything: delete `~/.neurodock/` and uninstall the browser
  extension. That is the entire reset procedure.

---

## 1. Who runs this thing

NeuroDock is a community-run open-source project under the
AGPL-3.0-or-later licence. The codebase lives at
[github.com/tlennon-ie/neurodock](https://github.com/tlennon-ie/neurodock).

There is no NeuroDock Inc. There is no NeuroDock LLC. There is no
NeuroDock SaaS. The maintainers operate as individuals. Security
reports go through [`SECURITY.md`](./SECURITY.md).

For data-protection purposes, **you are your own data controller** when
you use NeuroDock. The substrate runs entirely on your machine; the
project does not process your data on your behalf because the project
does not have a server.

---

## 2. What NeuroDock stores on your machine

All of the following lives on your device only. None of it is
transmitted anywhere by the substrate itself.

| What                              | Where                                          | Created when                                                                      |
| --------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| Your profile (identity, prefs)    | `~/.neurodock/profile.yaml`                    | First run of `neurodock init` or `install-all`                                    |
| Cognitive-graph memories          | `~/.neurodock/cognitive-graph.sqlite`          | First time the cognitive-graph server records a fact                              |
| Session marks (start/end, intent) | `~/.neurodock/cognitive-graph.sqlite`          | When you ask Claude to start or end a session                                     |
| Installed plugins                 | `~/.neurodock/plugins/<plugin-name>/`          | When you run `neurodock plugin add`                                               |
| Plugin enablement markers         | `~/.neurodock/plugins/<plugin-name>/.enabled`  | When you run `neurodock plugin enable`                                            |
| MCP server config entries         | Your MCP client's config (Claude Desktop etc.) | When you run `neurodock init`                                                     |
| Browser extension state           | `chrome.storage.local` (extension-scoped)      | See the extension's [own privacy policy](./packages/extension-browser/PRIVACY.md) |

That is the complete list of places NeuroDock can put data on your
machine. There is no hidden cache directory, no spool file, no
crashlog, no profiler trace.

---

## 3. What NeuroDock sends over the network

By default: **nothing**.

The MCP servers run as local subprocesses your MCP client (Claude
Desktop, Claude Code, Cursor) launches over stdio. They do not open
sockets and do not call out to the internet.

The CLI does not call out to the internet during normal operation. The
one exception is the `install-all` command, which invokes `pip install`
(or `uv pip install`) to fetch the six MCP server packages from PyPI.
That is a normal package-install network call, made by your system's
package manager, not by NeuroDock-controlled code.

The browser extension makes network calls only if you opt in to a cloud
LLM provider. When you do, the request goes **directly from your
browser to that provider's API**, signed with your own API key.
NeuroDock does not proxy that request, does not log it, does not see
it. Read the extension's privacy policy for the full surface.

---

## 4. What we do not do

- No analytics SDK. No Google Analytics, PostHog, Plausible, Sentry,
  Bugsnag, Honeycomb, or anything similar — anywhere in the substrate.
- No telemetry pings. No "phone home on first run". No update checks
  initiated by NeuroDock.
- No fingerprinting. We do not read hardware identifiers, OS-level
  identifiers, MAC addresses, or anything similar.
- No advertising. No affiliate trackers. No referral codes.
- No remote code execution. The MCP servers are signed Python packages
  installed from PyPI; the CLI is a signed npm package. Neither loads
  code from a remote server at runtime.
- No selling of data. There is no data to sell.
- No sharing with third parties. We have no third parties.

---

## 5. How to wipe everything

```sh
# Remove NeuroDock entries from your MCP client configs
npx --yes @neurodock/cli uninstall

# Delete your profile, memories, plugins, and any local state
rm -rf ~/.neurodock/
```

On Windows, the equivalent for the second step is:

```powershell
Remove-Item -Recurse -Force $HOME\.neurodock
```

If you also installed the browser extension, uninstall it through your
browser's extensions page. Per the extension's privacy policy, that
removes its `chrome.storage.local` data and its IndexedDB history.

That is the complete reset. There is no server-side copy of anything to
request deletion of, because there is no server.

---

## 6. Region-specific notes

### 6.1 European Economic Area, United Kingdom, Switzerland (GDPR / UK GDPR)

- **Legal basis for processing:** consent. You consent by installing the
  substrate and running it on your own machine.
- **Data controller:** you. NeuroDock stores everything on your device;
  the project has no server to process anything on your behalf.
- **Third-party processors:** none. We do not engage any.
- **International transfers:** none initiated by NeuroDock. If you enable
  a cloud LLM provider in the browser extension, that provider may
  transfer data internationally per their own policy; read theirs
  before opting in.
- **Right to access, rectify, erase, restrict, port, object:** every
  byte NeuroDock stores is on your device under your control. The `rm`
  command above is the practical exercise of your erasure right; the
  files themselves are the practical exercise of your access and
  portability rights.

### 6.2 California (CCPA / CPRA)

- **Categories of personal information collected:** none collected by
  NeuroDock. Information you put into your profile (your name, your
  neurotypes, your preferences) is stored on your device only.
- **Sale or sharing of personal information:** none. We have nothing
  to sell and no one to share with.
- **Right to delete:** the wipe procedure in §5 above.

### 6.3 Other jurisdictions

Local-only processing on your own device, with no transmission
initiated by the substrate, generally puts NeuroDock outside the scope
of most data-protection regimes targeted at controllers and processors.
Where it does not, the rights described above apply by default because
the data never leaves your control in the first place.

---

## 7. Children

NeuroDock is a general-audience tool designed primarily for
neurodivergent adults. We do not knowingly market it to or design for
children under 13, and we do not collect any data, so there is no
"data about children" to discuss.

---

## 8. Security

- The profile YAML and the SQLite database are plain files under your
  user account. They inherit your operating system's file permissions.
  Treat your device's account as the security boundary.
- Vulnerability reports go through [`SECURITY.md`](./SECURITY.md).
- For browser-extension-specific security details (API key handling,
  CSP, optional host permissions), see the
  [extension privacy policy](./packages/extension-browser/PRIVACY.md).

---

## 9. Changes to this policy

When this policy changes, we update the **Last reviewed** date at the
top and note the change in the root [`CHANGELOG.md`](./CHANGELOG.md).
Material changes (anything that broadens what data is collected or
where it goes) will be called out in the changelog explicitly, not
buried.

---

## 10. Contact

- Repository: https://github.com/tlennon-ie/neurodock
- Issues: https://github.com/tlennon-ie/neurodock/issues
- Security: see [`SECURITY.md`](./SECURITY.md) in the repo.

There is no support email associated with a company because there is no
company. Maintainers respond on GitHub.
