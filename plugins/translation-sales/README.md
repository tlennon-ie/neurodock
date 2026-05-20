# translation-sales

A NeuroDock `translation-pack` plugin that tunes [`mcp-translation`](../../packages/mcp-translation/) for the way sales, customer-success, and business-development professionals talk to prospects, customers, and each other.

> **What this is for.** When a buyer says "interesting" after your pitch and you can't tell if that means "tell me more" or "I am done with this call," this pack is the missing dictionary. It maps the commitment-avoidance, polite stalling, and stage-gated language of enterprise sales to plain language, with the subtext spelled out.

## Who it's for

- **Sales engineers and technical AEs** trying to read whether the buyer is engaged or just being polite.
- **Customer-success managers** decoding whether a renewal call is a routine check-in or a quiet churn signal.
- **First-time founders** reading their own pipeline and trying to figure out which deals are real.
- **Procurement and finance** decoding vendor responses on pricing and contract.
- **Technical staff** dragged into customer calls who don't yet have the sales-fluency to read what the call actually means.
- **Neurodivergent professionals** — particularly autistic and ADHD readers — who find that "we'll consider it" and "yes" sound the same in writing but seem to mean very different things to their sales colleagues.

This is not a way to feel cynical about sales conversations. It's a reading aid. The literal translations describe what a phrase _typically_ signals; context still matters, and the same phrase can mean different things at different deal stages.

## What it covers

This pack contains:

- **`phrases.yaml`** — a phrasebook of sales / CS / business-dev idiom (≥ 15 entries) mapping each phrase to a plain-language translation, a register tag (`polite-stall`, `soft-no`, `deal-stage-gatekeeping`, etc.), and example context.
- **`prompts/literal_meaning.md`** — the literal-meaning prompt override for `mcp-translation`. Loads the phrasebook and instructs the model to surface direct translations of sales-register phrases without claiming the deal is dead (it may not be; the phrase is a signal, not a verdict).
- **`prompts/subtext.md`** — the subtext prompt override. Identifies common patterns: polite stalling, soft-no, deal-stage gatekeeping, budget-hedging, and the "we'll loop in X" handoff.
- **`prompts/tone.md`** — the tone prompt override. Rewrites outgoing messages toward sales-appropriate register when the user wants to sound deal-ready, **without** the prompt making promises the user did not make.

## Install

If you've cloned the repo, the substrate auto-discovers the plugin at `<repo>/plugins/translation-sales/`. Just restart your client.

To install per-user (without forking the repo):

```bash
neurodock plugin add ./plugins/translation-sales
```

The CLI's `plugin add` copies the directory into `$XDG_DATA_HOME/neurodock/plugins/translation-sales/` (with platform fallbacks for macOS and Windows). The discovery walker picks it up on next start.

Manual install (if the CLI isn't available yet):

```bash
# Linux
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/translation-sales ~/.local/share/neurodock/plugins/

# macOS
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/translation-sales "$HOME/Library/Application Support/neurodock/plugins/"
```

```powershell
# Windows PowerShell
$dest = "$env:APPDATA\neurodock\plugins\translation-sales"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\translation-sales $dest
```

## How to extend the phrasebook

The phrasebook in `phrases.yaml` is intentionally small (a starting set, not a complete dictionary). Real sales idiom varies by industry, deal size, and motion (SMB vs enterprise vs PLG). To add an entry, follow the existing shape:

```yaml
- phrase: "Let me get back to you on that"
  literal: "I don't have an answer right now. Whether you hear back depends on whether this deal is still alive on my side."
  register: polite-stall
  context:
    - "Mid-call response to a question the rep didn't expect."
    - "Often paired with a follow-up email that does or doesn't arrive."
  notes: |
    On a healthy deal, the rep follows up within 24-48 hours. Silence
    past a week is itself a signal, regardless of what the phrase said.
```

The `register` tag should be one of: `polite-stall`, `soft-no`, `deal-stage-gatekeeping`, `budget-hedge`, `interest-signal`, `commitment-avoidance`, `handoff`, `discount-negotiation`, or add a new tag in your fork and document it. Loaders preserve unknown tags on round-trip per ADR 0007.

When you contribute back, please:

1. Cite the context where the phrase routinely appears (cold outbound, discovery, mid-funnel, late-stage, post-close).
2. Note when the same phrase means different things at different deal stages. "Interesting" on a first call ≠ "interesting" in a contract negotiation.
3. Avoid being contemptuous of the people using these phrases. The sales profession has a vocabulary; the goal is to translate it, not to diagnose it.

## Eval coverage

A real translation-pack ships with its own eval corpus at `eval/corpus.yaml` per the [translation-pack contribution guide](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx). This plugin currently ships only the phrasebook and prompts; an eval corpus is the next contribution. Until eval coverage lands, this pack stays at `trust.level: community` and cannot graduate to `reviewed`.

## What this plugin is NOT

- It is not a "your deal is dead" detector. It surfaces signals; it does not declare verdicts. A phrase can mean different things at different deal stages, and only the rep knows the full context.
- It does not claim sales people are dishonest. The register exists because deals have stages and reps cannot commit on calls they don't own. Translating the register is not the same as judging the speaker.
- It does not aggregate any pipeline data. Everything stays local to your `mcp-translation` install per the ADR 0005 privacy model.
- It does not coach selling. There are excellent books and courses for that; this pack only translates incoming signals.

## License

AGPL-3.0-or-later. Same as the substrate. See [`LICENSE`](./LICENSE).

## Further reading

- [`plugins/translation-legal/`](../translation-legal/) — sibling pack covering legal-profession idiom.
- [Plugin type — translation-pack](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx) — full contribution guide.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md) — manifest contract design rationale.
- [`plugins/README.md`](../README.md) — contributor reference for the `plugins/` directory.
