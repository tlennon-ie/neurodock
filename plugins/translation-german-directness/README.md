# translation-german-directness

A NeuroDock `translation-pack` plugin that tunes [`mcp-translation`](../../packages/mcp-translation/) for the cultural conventions of German workplace communication.

> **What this is for.** When a German colleague writes "das ist so nicht akzeptabel" and you can't tell whether you've been criticised personally, criticised professionally, or merely had a single specific clause flagged for revision — this pack is the missing dictionary. **Directness is not rudeness** in the target register. The pack helps you read neutral signals as neutral, rather than reading aggression where none is intended.

## Who it's for

- **Neurodivergent professionals working in or with German-speaking workplaces** — particularly autistic and ADHD readers who can feel destabilised by direct critique when their other workplace contexts use heavier softening.
- **Anglophone, Latin, and East-Asian colleagues** working with German-speaking teams for the first time, who can read German workplace directness as escalation when it is in fact the neutral baseline.
- **German speakers working in Anglophone or East-Asian contexts** who get feedback that they come across as "rude" or "aggressive" and want help calibrating in the other direction.
- **HR and people-ops staff** mediating cross-cultural conflict where one side has read directness as hostility while the other read softening as evasiveness.

This is not a pop-culture caricature of German communication. The pack reflects a specific cultural convention — that direct critique on a piece of work is a sign of professional respect, not personal hostility — and translates it for readers from registers where that convention does not hold. The literal translations describe what a phrase _typically_ means; individual variation is significant, and the same phrase can land differently depending on the speaker's seniority, the working relationship, and the channel.

## What it covers

This pack contains:

- **`phrases.yaml`** — a phrasebook of German workplace idiom (≥ 15 entries) mapping each phrase to a literal translation, a register tag (`direct-factual`, `formal-imperative`, `register-shift`, `agenda-discipline`, `email-closure`), and example context. Many entries include both the German phrase and a plain-English equivalent that preserves the directness register.
- **`prompts/literal_meaning.md`** — the literal-meaning prompt override. Loads the phrasebook and instructs the model to surface direct translations WITHOUT inferring hostility. Where the literal text sounds aggressive to a softer-register reader, the prompt flags the cultural baseline so the reader can recalibrate.
- **`prompts/subtext.md`** — the subtext prompt override. Identifies common patterns: scoped critique (one specific item flagged, the rest implicitly approved), conditional-no-as-soft-yes, Sie/du register choices, Termin-discipline (the German cultural norm around appointments and agenda items), and the role of fact-based criticism that contains no personal element at all.
- **`prompts/tone.md`** — the tone prompt override. Rewrites outgoing messages in either direction: toward the German directness register when a softer-register speaker wants to fit in, OR away from the German register toward more softened defaults when a German-register speaker is being misread by an Anglophone audience.

## Install

If you've cloned the repo, the substrate auto-discovers the plugin at `<repo>/plugins/translation-german-directness/`. Just restart your client.

To install per-user (without forking the repo):

```bash
neurodock plugin add ./plugins/translation-german-directness
```

The CLI's `plugin add` copies the directory into `$XDG_DATA_HOME/neurodock/plugins/translation-german-directness/` (with platform fallbacks for macOS and Windows). The discovery walker picks it up on next start.

Manual install (if the CLI isn't available yet):

```bash
# Linux
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/translation-german-directness ~/.local/share/neurodock/plugins/

# macOS
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/translation-german-directness "$HOME/Library/Application Support/neurodock/plugins/"
```

```powershell
# Windows PowerShell
$dest = "$env:APPDATA\neurodock\plugins\translation-german-directness"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\translation-german-directness $dest
```

## How to extend the phrasebook

The phrasebook in `phrases.yaml` is intentionally small (a starting set, not a comprehensive dictionary). German workplace register varies by region (Berlin, Bavaria, Hamburg), by sector (engineering vs creative vs consulting), by company culture, and by generation. To add an entry, follow the existing shape:

```yaml
- phrase: "Das funktioniert so nicht."
  literal: "This does not work in its current form. A specific issue exists; please fix it. No personal critique is implied."
  register: direct-factual
  context:
    - "Code review."
    - "Document review."
    - "Engineering or operations discussions where a proposed solution has a defect."
  notes: |
    Read as a fact-statement about the artefact, not a judgement about
    the author. The German workplace convention is that flagging a defect
    is a professional courtesy; not flagging it would be a discourtesy.
```

The `register` tag should be one of: `direct-factual`, `formal-imperative`, `register-shift`, `agenda-discipline`, `email-closure`, `scoped-critique`, `conditional-yes-as-soft-no`, or add a new tag in your fork and document it. Loaders preserve unknown tags on round-trip per ADR 0007.

When you contribute back, please:

1. Cite the context where the phrase routinely appears (email vs Slack vs meeting; engineering vs sales vs HR).
2. Avoid pan-German claims. "In Berlin tech-sector Slack threads" is fine; "Germans always" is a caricature.
3. **Do not editorialise about German speakers.** The phrase "Germans are blunt" is exactly the framing this pack exists to push back against. Directness is a cultural convention doing real work — it preserves clarity, respects the listener's time, and keeps personal and professional separate. Translate the convention; do not score points about it.

## Eval coverage

A real translation-pack ships with its own eval corpus at `eval/corpus.yaml` per the [translation-pack contribution guide](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx). This plugin currently ships only the phrasebook and prompts; an eval corpus is the next contribution. Until eval coverage lands, this pack stays at `trust.level: community` and cannot graduate to `reviewed`.

## What this plugin is NOT

- It is not a phrasebook for tourists or for German-language learners. The entries are workplace-register specific; many will read oddly outside a professional context.
- It is not a substitute for actually working alongside German colleagues. Register knowledge accumulates from exposure.
- It is not a claim that all German speakers communicate identically. Regional, sector, generational, and individual variation are all real. The entries describe a common workplace default; your colleague's mileage will vary.
- **It is not a personality stereotype.** "Germans are blunt" is precisely the framing this pack is designed to refuse. Directness is a cultural convention doing real social and professional work; it is not a character trait. The pack helps readers from softer registers see the difference between neutral and hostile signals — most of what feels "blunt" to an outside reader is neutral inside the target register.
- It does not aggregate any user data. Everything stays local to your `mcp-translation` install per the ADR 0005 privacy model.

## License

AGPL-3.0-or-later. Same as the substrate. See [`LICENSE`](./LICENSE).

## Further reading

- [`plugins/translation-legal/`](../translation-legal/) — sibling pack covering legal-profession idiom.
- [`plugins/translation-sales/`](../translation-sales/) — sibling pack covering sales / customer-success idiom.
- [`plugins/translation-hiberno-english/`](../translation-hiberno-english/) — sibling pack covering Hiberno-English softening.
- [`plugins/translation-japanese-keigo/`](../translation-japanese-keigo/) — sibling pack covering Japanese keigo.
- [Plugin type — translation-pack](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx) — full contribution guide.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md) — manifest contract design rationale.
- [`plugins/README.md`](../README.md) — contributor reference for the `plugins/` directory.
