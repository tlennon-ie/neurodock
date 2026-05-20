# translation-customer-support

A NeuroDock `translation-pack` plugin that tunes [`mcp-translation`](../../packages/mcp-translation/) for the bidirectional register that runs through customer-support channels — both the customer-in-distress writing in and the support agent writing back.

> **What this is for.** When a customer email opens with "this is completely unacceptable" and you can't tell whether the right response is an apology, an escalation, a refund, or all three, this pack is the missing dictionary. It maps the de-escalation, churn-risk, reputational-risk, and policy-citation patterns of support correspondence to plain language, with the subtext spelled out — in both directions.

## Who it's for

- **Tier-1 and tier-2 support agents** decoding inbound escalation signals and softening outbound replies under volume pressure.
- **New support hires** learning the register without absorbing the affect — the customer's intensity is information about the situation, not a verdict on the agent.
- **Engineers pulled into tier-2 escalations** who can write technically-correct replies but not yet emotionally-aware ones.
- **Founders staffing their own support inbox** before there is a support team, trying to figure out which messages are real churn risks and which are routine frustration.
- **Customer-success managers** reading whether a support ticket has crossed from inquiry into churn-risk territory.
- **Product researchers** reading support verbatims and trying to separate the affect from the signal.
- **Neurodivergent professionals** — particularly autistic and ADHD readers — who report that "this is unacceptable" and "I have a bug report" feel like the same kind of message but are received as opposite signals by colleagues.

This is not a way to feel cynical about angry customers or jaded support scripts. It's a reading aid in both directions. Customers in distress are communicating real needs; their phrasing is information, not character. Support agents are doing emotional labour at scale; their scripts exist because the channel demands them.

## What it covers

This pack contains:

- **`phrases.yaml`** — a phrasebook of customer-support idiom (≥ 15 entries) mapping each phrase to a plain-language translation, a `direction` tag (`inbound` from customers OR `outbound` from support), a register tag (`de-escalation`, `churn-risk-signal`, `policy-citation`, `validation-phrase`, etc.), and example context.
- **`prompts/literal_meaning.md`** — the literal-meaning prompt override for `mcp-translation`. Loads the phrasebook and instructs the model to surface direct translations of support-register phrases in both directions, including escalation-level classification (frustration-peak, churn-risk, reputational-risk, routine).
- **`prompts/subtext.md`** — the subtext prompt override. Identifies common patterns in both directions: inbound (frustration-peak, churn-risk, process-failure, refund-request, bug-report, escalation-request) and outbound (de-escalation, policy-citation, handoff, deferral, case-closure, defensive marker).
- **`prompts/tone.md`** — the tone prompt override for outbound rewrites. Tunes support agent drafts toward validation-before-action, acknowledgement-before-policy, affirmative-before-limitation, and SLA-aware handoffs.

## Bidirectional design

Most translation packs in this monorepo are uni-directional: `translation-legal` reads incoming legal correspondence and softens outgoing replies, but both directions are written by professionals in the same register. Customer-support is different:

- **Inbound** is written by customers under stress, time pressure, or after self-serve failure. The vocabulary is everyday English carrying load-bearing signals.
- **Outbound** is written by support agents under volume pressure, often working from internal scripts. The vocabulary is more formalised; the trust-erosion patterns are well-documented in CSAT research.

The pack's `phrases.yaml` carries a `direction` field on every entry so the same phrase in different directions gets matched against the right entry. The two prompts that read messages (`literal_meaning.md`, `subtext.md`) operate in both directions; the prompt that rewrites messages (`tone.md`) is outbound-only — the customer's words are evidence to be read, not text to be edited.

## Install

If you've cloned the repo, the substrate auto-discovers the plugin at `<repo>/plugins/translation-customer-support/`. Just restart your client.

To install per-user (without forking the repo):

```bash
neurodock plugin add ./plugins/translation-customer-support
```

The CLI's `plugin add` copies the directory into `$XDG_DATA_HOME/neurodock/plugins/translation-customer-support/` (with platform fallbacks for macOS and Windows). The discovery walker picks it up on next start.

Manual install (if the CLI isn't available yet):

```bash
# Linux
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/translation-customer-support ~/.local/share/neurodock/plugins/

# macOS
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/translation-customer-support "$HOME/Library/Application Support/neurodock/plugins/"
```

```powershell
# Windows PowerShell
$dest = "$env:APPDATA\neurodock\plugins\translation-customer-support"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\translation-customer-support $dest
```

## How to extend the phrasebook

The phrasebook in `phrases.yaml` is intentionally small (a starting set, not a complete dictionary). Support idiom varies by industry (B2B SaaS vs consumer apps vs regulated industries like healthcare and finance), by channel (chat vs email vs phone), and by tier (tier-1 vs tier-2 vs executive support). To add an entry, follow the existing shape:

```yaml
- phrase: "This was supposed to be simple"
  direction: inbound
  literal: "Customer is signalling that the effort cost has exceeded the expected effort. They may be frustrated AND correct (the product genuinely is too complex for the task). Validate the effort gap before defending the design."
  register: frustration-peak
  context:
    - "Reply to documentation that pointed the customer at a multi-step workaround."
    - "Mid-thread after the customer has been bounced between tiers."
  notes: |
    Often a leading indicator of churn for self-serve / SMB tiers, where
    the customer's tolerance for setup complexity is lower than the
    company assumes.
```

The `direction` field is mandatory and must be exactly `inbound` or `outbound`. The `register` tag should be one of: `de-escalation`, `churn-risk-signal`, `reputational-risk-signal`, `process-failure-signal`, `refund-request`, `bug-report-signal`, `escalation-request`, `validation-phrase`, `policy-citation`, `escalation-handoff`, `team-handoff`, `deferral`, `case-closure`, `feedback-acknowledgement`, `action-confirmation`, `defensive-marker`, or add a new tag in your fork and document it. Loaders preserve unknown tags on round-trip per ADR 0007.

When you contribute back, please:

1. Mark the `direction` accurately. The same surface phrase can mean different things inbound vs outbound; the pack relies on the direction field to disambiguate.
2. Cite the context where the phrase routinely appears (tier-1 first-touch, escalation, bug report, refund dispute, etc.).
3. Note when the same phrase is conditionally appropriate. "I understand how frustrating this must be" with a specific frustration named is genuinely useful; alone, it is the single most-flagged complaint in CSAT surveys. The notes field should make this distinction.
4. Avoid contempt in both directions. Frustrated customers are not "Karens"; scripted agents are not "robots." Translate the register; don't moralise about the people.

## Eval coverage

A real translation-pack ships with its own eval corpus at `eval/corpus.yaml` per the [translation-pack contribution guide](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx). This plugin currently ships only the phrasebook and prompts; an eval corpus is the next contribution. Until eval coverage lands, this pack stays at `trust.level: community` and cannot graduate to `reviewed`.

## What this plugin is NOT

- It is not a way to dismiss angry customers. Frustration is information, not character. The pack helps the agent see the structure of the message so they can respond to the underlying need, not so they can label the customer.
- It is not a way to bypass support training. Real support work involves judgement, product knowledge, and authority the pack cannot supply. The pack helps with register; it does not make resolution decisions.
- It is not a sentiment-scoring tool. Sentiment scores collapse the structure of a message into one number; this pack does the opposite, surfacing each signal as a separate hypothesis.
- It does not aggregate any ticket data. Everything stays local to your `mcp-translation` install per the ADR 0005 privacy model.
- It is not a substitute for the company actually fixing the things customers are complaining about. A bug-report signal repeated across many tickets is product work, not a translation problem.
- It does not coach support managers on staffing, SLAs, or routing. Those are operational concerns; this pack only translates the messages.

## License

AGPL-3.0-or-later. Same as the substrate. See [`LICENSE`](./LICENSE).

## Further reading

- [`plugins/translation-legal/`](../translation-legal/) — sibling pack covering legal-profession idiom.
- [`plugins/translation-sales/`](../translation-sales/) — sibling pack covering sales / customer-success idiom.
- [`plugins/translation-healthcare/`](../translation-healthcare/) — sibling pack covering healthcare-profession idiom.
- [Plugin type — translation-pack](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx) — full contribution guide.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md) — manifest contract design rationale.
- [`plugins/README.md`](../README.md) — contributor reference for the `plugins/` directory.
