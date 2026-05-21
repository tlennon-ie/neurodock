# translation-legal

A NeuroDock `translation-pack` plugin that tunes [`mcp-translation`](../../packages/mcp-translation/) for the way lawyers and legal-adjacent professionals write to each other.

> **What this is for.** When you read "I'd be grateful if you could revert by close of play" and don't immediately know whether that means "I want this today" or "answer when you can," this pack is the missing dictionary. It maps the hedged, indirect register of legal correspondence to plain language, with the subtext spelled out.

## Who it's for

- **In-house counsel** trying to parse outside-counsel correspondence (or vice versa).
- **Paralegals** who need to know whether "as a matter of housekeeping" means "small admin item" or "I am about to drop something heavy on you."
- **Legal-tech PMs** decoding what stakeholders inside a legal department actually want from a feature request.
- **Neurodivergent professionals** — particularly autistic and ADHD readers — who find that the literal text of a legal email never quite matches what their colleagues seem to take from it.
- **Anyone working with British firms** for the first time. The British-firm register is now the global default for legal correspondence, and the unstated rules are unstated for a reason.

This is not a substitute for a lawyer. It's a reading aid for register. The literal translations describe what a phrase _typically_ means; context still matters, and the same phrase can mean different things in different deal stages, court contexts, or relationships.

## What it covers

This pack contains:

- **`phrases.yaml`** — a phrasebook of legal-profession idiom (≥ 15 entries) mapping each phrase to a plain-language translation, a register tag (`formal`, `passive-aggressive`, `legal-term-of-art`, etc.), and example context.
- **`prompts/literal_meaning.md`** — the literal-meaning prompt override for `mcp-translation`. Loads the phrasebook and instructs the model to surface direct translations of legal-register phrases without flattening their function (e.g. don't strip "without prejudice" from a settlement letter; explain what it does).
- **`prompts/subtext.md`** — the subtext prompt override. Identifies common patterns: deferred-decision framing, soft-no, hedged commitments, and the British-firm "happy to discuss further" pattern that usually means the opposite.
- **`prompts/tone.md`** — the tone prompt override. Rewrites outgoing messages toward the legal-formal register when the user is corresponding with counsel and wants to avoid sounding unprofessional, **without** the prompt cosplaying as legal advice.

## Install

Use the NeuroDock CLI (requires `@neurodock/cli` ≥ 0.4.0). Run from the repo root:

```sh
# Install
neurodock plugin add ./plugins/translation-legal

# Activate
neurodock plugin enable translation-legal

# Restart your MCP client (Claude Desktop, Claude Code, Cursor)

# Verify
neurodock plugin list
```

`plugin add` copies the directory into `$XDG_DATA_HOME/neurodock/plugins/translation-legal/` (with platform fallbacks for macOS and Windows). `plugin validate ./plugins/translation-legal` will check the manifest before install if you want to dry-run.

<details>
<summary>Manual install per OS (if you don't have the CLI yet)</summary>

```bash
# Linux
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/translation-legal ~/.local/share/neurodock/plugins/

# macOS
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/translation-legal "$HOME/Library/Application Support/neurodock/plugins/"
```

```powershell
# Windows PowerShell
$dest = "$env:APPDATA\neurodock\plugins\translation-legal"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\translation-legal $dest
```

</details>

## How to extend the phrasebook

The phrasebook in `phrases.yaml` is intentionally small (a starting set, not a comprehensive dictionary). Real legal idiom varies by jurisdiction, firm, and practice area. To add an entry, follow the existing shape:

```yaml
- phrase: "I'll revert in due course"
  literal: "I have no committed date for this. Treat as 'no response this week'; if you need it sooner, ask explicitly."
  register: hedged-commitment
  context:
    - "Outside counsel responding to an in-house ask without a deadline."
    - "Often paired with an unspecified action ('I'll consider the position') that doesn't bind anyone."
  notes: |
    "In due course" is not a synonym for "soon." It's a non-commitment phrased
    politely. If your matter is time-sensitive, name the date.
```

The `register` tag should be one of: `formal`, `passive-aggressive`, `legal-term-of-art`, `hedged-commitment`, `soft-no`, `british-firm-softening`, `american-biglaw-directness`, or add a new tag in your fork and document it. Loaders preserve unknown tags on round-trip per ADR 0007.

When you contribute back, please:

1. Cite the context where the phrase routinely appears (deal-stage, court filing, in-house vs. outside).
2. Avoid making jurisdictional claims unless you can source them. "In English contract correspondence" is fine; "in English contract law" is a claim that needs a citation.
3. Don't editorialise about the lawyers using the phrase. The goal is to translate the register, not to score points about the profession.

## Eval coverage

A real translation-pack ships with its own eval corpus at `eval/corpus.yaml` per the [translation-pack contribution guide](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx). This plugin currently ships only the phrasebook and prompts; an eval corpus is the next contribution. Until eval coverage lands, this pack stays at `trust.level: community` and cannot graduate to `reviewed`.

## What this plugin is NOT

- It is not legal advice. It explains how lawyers talk, not what they're saying about your particular situation.
- It does not make jurisdictional claims. The same phrase ("without prejudice") has slightly different operational effects in different jurisdictions; the pack notes the typical effect, not the binding one.
- It does not editorialise about lawyers. The literal translations describe what the speaker _means_, not whether they are being honest, helpful, or otherwise.
- It does not aggregate any user data. Everything stays local to your `mcp-translation` install per the ADR 0005 privacy model.

## License

AGPL-3.0-or-later. Same as the substrate. See [`LICENSE`](./LICENSE).

## Further reading

- [`plugins/translation-sales/`](../translation-sales/) — sibling pack covering sales / customer-success idiom.
- [Plugin type — translation-pack](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx) — full contribution guide.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md) — manifest contract design rationale.
- [`plugins/README.md`](../README.md) — contributor reference for the `plugins/` directory.
