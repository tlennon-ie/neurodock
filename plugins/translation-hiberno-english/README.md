# translation-hiberno-english

A NeuroDock `translation-pack` plugin that tunes [`mcp-translation`](../../packages/mcp-translation/) for the way Irish workplaces actually talk.

> **What this is for.** When a colleague says "I'll have a go at it" and you can't tell whether you've just been given a commitment, a polite brush-off, or a vague maybe — this pack is the missing dictionary. It maps the softening, hedging, and conversation-closure patterns of Hiberno-English workplace register to plain language, with the subtext spelled out.

## Who it's for

- **Neurodivergent professionals working in Irish offices** — particularly autistic and ADHD readers who experience the gap between literal Hiberno-English and what their colleagues seem to mean from it.
- **Remote colleagues working across Ireland and another market**, where a Slack thread can switch register mid-conversation without warning.
- **New joiners to Irish workplaces**, whether moving from another country or another sector, who keep getting blindsided by "we'll see how we get on."
- **Irish-diaspora returners** coming back to work in Ireland after years abroad, where the register has shifted slightly while you were away.
- **Anyone who has misread "it's grand"** as agreement and then discovered the issue was still very much live.

This is not a phrasebook for tourists, and it is not a substitute for actually working with Irish colleagues. It's a register-decoder for the workplace, with examples drawn from email, Slack, and meeting contexts. The literal translations describe what a phrase _typically_ means — context, relationship, and the speaker's seniority all change the reading.

## What it covers

This pack contains:

- **`phrases.yaml`** — a phrasebook of Hiberno-English workplace idiom (≥ 15 entries) mapping each phrase to a plain-language translation, a register tag (`softening`, `dismissal`, `hedging`, `enthusiasm-marker`, `closing-marker`, `understatement`), and example context.
- **`prompts/literal_meaning.md`** — the literal-meaning prompt override. Loads the phrasebook and instructs the model to surface the direct translation without assuming softening = evasion. Softening is the cultural norm, not a flag of bad faith.
- **`prompts/subtext.md`** — the subtext prompt override. Identifies common patterns: soft-no via "I might do that," conversation-closing via "ah, sure look," hedged commitment via "I'll have a go at it," and the understated-positive register that Irish speakers use even for genuine enthusiasm.
- **`prompts/tone.md`** — the tone prompt override. Rewrites outgoing messages toward Hiberno-English softening when the user wants to fit the local register (and back the other way, when the user has been mis-read as too brusque).

## Install

If you've cloned the repo, the substrate auto-discovers the plugin at `<repo>/plugins/translation-hiberno-english/`. Just restart your client.

To install per-user (without forking the repo):

```bash
neurodock plugin add ./plugins/translation-hiberno-english
```

The CLI's `plugin add` copies the directory into `$XDG_DATA_HOME/neurodock/plugins/translation-hiberno-english/` (with platform fallbacks for macOS and Windows). The discovery walker picks it up on next start.

Manual install (if the CLI isn't available yet):

```bash
# Linux
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/translation-hiberno-english ~/.local/share/neurodock/plugins/

# macOS
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/translation-hiberno-english "$HOME/Library/Application Support/neurodock/plugins/"
```

```powershell
# Windows PowerShell
$dest = "$env:APPDATA\neurodock\plugins\translation-hiberno-english"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\translation-hiberno-english $dest
```

## How to extend the phrasebook

The phrasebook in `phrases.yaml` is intentionally small (a starting set, not a comprehensive dictionary). Hiberno-English varies by region (Dublin, Cork, Galway, the North), by generation, and by workplace culture. To add an entry, follow the existing shape:

```yaml
- phrase: "I'll see what I can do"
  literal: "I am not committing to anything. Treat as 'probably not, but I won't say no to your face.'"
  register: hedging
  context:
    - "Reply to a request the speaker doesn't want to commit to."
    - "Often paired with a sympathetic tone that masks the absence of commitment."
  notes: |
    The reassuring tone is the giveaway. A genuine commitment in Hiberno-English
    register tends to be more specific ("I'll have that for you by Thursday")
    even when softened.
```

The `register` tag should be one of: `softening`, `dismissal`, `hedging`, `enthusiasm-marker`, `closing-marker`, `understatement`, `soft-no`, `disagreement-via-question`, or add a new tag in your fork and document it. Loaders preserve unknown tags on round-trip per ADR 0007.

When you contribute back, please:

1. Cite the context where the phrase routinely appears (Slack vs email vs meeting; senior-to-junior vs peer).
2. Avoid pan-Irish claims. "In Dublin tech-sector Slack threads" is fine; "Irish people say" is a caricature.
3. Don't editorialise about Irish speakers. The goal is to translate the register, not to score points about the culture. Softening is doing real social work — it preserves the relationship while the speaker declines, hedges, or closes the topic.

## Eval coverage

A real translation-pack ships with its own eval corpus at `eval/corpus.yaml` per the [translation-pack contribution guide](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx). This plugin currently ships only the phrasebook and prompts; an eval corpus is the next contribution. Until eval coverage lands, this pack stays at `trust.level: community` and cannot graduate to `reviewed`.

## What this plugin is NOT

- It is not a phrasebook for tourists. The entries are workplace-register specific; using them at the pub will get you funny looks.
- It is not a substitute for actual fluency or for working alongside Irish colleagues over time. Register knowledge accumulates from exposure; this pack accelerates the early curve, it does not replace it.
- It is not a claim that all Irish speakers use these registers identically. Hiberno-English varies by region, generation, sector, and individual. The entries describe a common workplace default; your colleague's mileage will vary.
- It is not a personality assessment. Softening is a cultural convention doing real social work. A speaker who says "I might do that" rather than "no" is not being evasive — they are declining while preserving the relationship and the option to revisit later.
- It does not aggregate any user data. Everything stays local to your `mcp-translation` install per the ADR 0005 privacy model.

## License

AGPL-3.0-or-later. Same as the substrate. See [`LICENSE`](./LICENSE).

## Further reading

- [`plugins/translation-legal/`](../translation-legal/) — sibling pack covering legal-profession idiom.
- [`plugins/translation-sales/`](../translation-sales/) — sibling pack covering sales / customer-success idiom.
- [`plugins/translation-german-directness/`](../translation-german-directness/) — sibling pack covering German workplace directness.
- [`plugins/translation-japanese-keigo/`](../translation-japanese-keigo/) — sibling pack covering Japanese keigo.
- [Plugin type — translation-pack](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx) — full contribution guide.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md) — manifest contract design rationale.
- [`plugins/README.md`](../README.md) — contributor reference for the `plugins/` directory.
