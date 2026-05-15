# Security

This document describes how to report a security issue in NeuroDock, what we defend against, and what we do not.

## Reporting a vulnerability

Send vulnerability reports to `security@neurodock.org`. Encrypted submission is welcome; the council publishes a current PGP key in the repository alongside this file.

Include in your report:

- A description of the issue and the affected package or component.
- Steps to reproduce, or a proof-of-concept, if you have one.
- The version, commit hash, or release tag where you observed it.
- Your preferred name and contact for follow-up, and whether you want public credit.

Do not open a public issue for a security report. Once the issue is resolved and disclosed, the council credits reporters who want credit.

## Severity

We classify reported issues at one of four levels.

- **Critical** — remote code execution on a user's machine, silent exfiltration of user data, or a vulnerability that bypasses a guardrail without surfacing the bypass.
- **High** — local privilege escalation, unauthorised access to a user's profile or cognitive graph, or a path that defeats consent prompts.
- **Medium** — a flaw that requires user interaction or unusual configuration to exploit, or that leaks non-sensitive metadata.
- **Low** — a defence-in-depth weakness with no demonstrated path to user harm.

## Response SLA

First acknowledgement of a report arrives within five working days. Some maintainers operate on a slower async cadence; the council ensures coverage so reports are not stalled by any one maintainer being AFK.

After acknowledgement, the council triages the report and targets the following resolution windows.

| Severity | Target fix |
|---|---|
| Critical | 14 calendar days |
| High | 30 calendar days |
| Medium | 60 calendar days |
| Low | Next scheduled release |

We post status updates to the reporter at least every fourteen days while a report is open.

## Threat model

We design against the threats that realistically face an open-source local-first tool used by individual professionals.

We defend against:

- Typical supply-chain compromises in our published packages (signed releases, SLSA L2 provenance, dependency auditing).
- Unintended exposure of user data — profile contents, cognitive graph entries, eval submissions — to the network or other local users.
- Bypass of a configured guardrail without the user being told it was bypassed.
- Malicious or trojaned third-party plugins discovered through official channels.

We do not defend against:

- A determined nation-state adversary with custom tooling and physical access.
- Side-channel attacks on the user's host operating system.
- An attacker who already has root or equivalent on the user's machine.
- Vulnerabilities in the user's chosen LLM provider, MCP client, or browser, except where our integration code is the vector.

If your threat model includes the items in the second list, NeuroDock alone is not sufficient, and we say so plainly.

## Coordinated disclosure

The default disclosure window is ninety days from acknowledgement. We publish a security advisory on the affected repository when the window closes or the fix ships, whichever is sooner.

We shorten the window when the fix is trivial and the reporter agrees. We extend the window only by mutual agreement with the reporter, and only when a longer window meaningfully reduces user risk.

## Alignment with the master plan

This document operationalises Section 9 of `plan.md` (security and supply chain) and inherits the AFK and council coverage commitments from `GOVERNANCE.md`.
