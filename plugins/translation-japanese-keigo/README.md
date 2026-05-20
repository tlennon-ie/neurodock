# translation-japanese-keigo

A NeuroDock `translation-pack` plugin that tunes [`mcp-translation`](../../packages/mcp-translation/) for Japanese workplace keigo (formal language) and the registers it composes.

> **What this is for.** When a Japanese colleague replies "検討させていただきます" (kentou sasete itadakimasu — "I will consider it") and you can't tell whether the answer is a real yes, a real maybe, or a polite no — this pack is the missing dictionary. It surfaces the substantive content behind keigo's soft refusals, refusals-via-omission, and vertical-register choices, while preserving the social work that the formal register performs.

## Who it's for

- **Neurodivergent professionals working in or with Japanese workplaces** — particularly autistic and ADHD readers who can miss the substantive content behind keigo's indirection.
- **Non-Japanese colleagues** collaborating with Japanese teams who need help disambiguating soft refusals ("検討します," "難しいかもしれません") from actual deliberations.
- **Japanese diaspora returners** coming back to Japanese workplaces after years abroad, where the keigo conventions and the things they signal have evolved.
- **HR and people-ops staff** mediating cross-cultural conflict where one side has read keigo softening as evasion while the other side experienced direct-register pushback as rude.

This is not a Japanese-language tutorial and it is not a substitute for actual fluency. Keigo is a deep system — three core formal registers (sonkeigo, kenjougo, teineigo) plus the casual register, with verb morphology, vocabulary substitutions, and pronoun choices all encoding relative status. The pack covers a workplace-relevant sliver and translates what those workplace conventions tend to mean.

## What it covers

This pack contains:

- **`phrases.yaml`** — a phrasebook of Japanese workplace keigo idiom (≥ 15 entries) with Japanese, romaji, literal translation, register tag (`sonkeigo`, `kenjougo`, `teineigo`, `refusal-via-omission`, `soft-refusal`, `humble-acknowledgement`, `meeting-deferral`), and example context.
- **`prompts/literal_meaning.md`** — the literal-meaning prompt override. Loads the phrasebook and instructs the model to surface omitted content (Japanese leaves much unsaid), decode soft refusals from formal-acceptance shapes, and respect the social work keigo performs.
- **`prompts/subtext.md`** — the subtext prompt override. Identifies common patterns: soft refusal-via-positive-shape ("検討させていただきます" / "前向きに検討します"), refusal-via-omission ("ちょっと..."), group-decision deferral ("社内で検討させていただきます"), and the vertical-register signalling that encodes status.
- **`prompts/tone.md`** — the tone prompt override. Rewrites outgoing messages toward the appropriate keigo register (sonkeigo when addressing a senior, kenjougo when speaking of one's own actions, teineigo as neutral polite default) OR away from keigo when a Japanese-register draft is being misread by a more direct audience.

## Install

If you've cloned the repo, the substrate auto-discovers the plugin at `<repo>/plugins/translation-japanese-keigo/`. Just restart your client.

To install per-user (without forking the repo):

```bash
neurodock plugin add ./plugins/translation-japanese-keigo
```

The CLI's `plugin add` copies the directory into `$XDG_DATA_HOME/neurodock/plugins/translation-japanese-keigo/` (with platform fallbacks for macOS and Windows). The discovery walker picks it up on next start.

Manual install (if the CLI isn't available yet):

```bash
# Linux
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/translation-japanese-keigo ~/.local/share/neurodock/plugins/

# macOS
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/translation-japanese-keigo "$HOME/Library/Application Support/neurodock/plugins/"
```

```powershell
# Windows PowerShell
$dest = "$env:APPDATA\neurodock\plugins\translation-japanese-keigo"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\translation-japanese-keigo $dest
```

## How to extend the phrasebook

The phrasebook in `phrases.yaml` is intentionally small (a starting set, not a comprehensive dictionary). Japanese workplace register varies by sector (manufacturing keigo differs from tech-startup keigo), by company size (large-company convention differs from SME), and by generation. To add an entry, follow the existing shape:

```yaml
- phrase: "お時間をいただけますでしょうか"
  romaji: "o-jikan o itadakemasu deshou ka"
  literal: "May I have some of your time? Polite request to schedule a meeting or call. The 'o-jikan' (honourable time) is sonkeigo; the 'itadakemasu' is kenjougo — the speaker raises the listener and lowers themselves simultaneously."
  register: sonkeigo
  context:
    - "Email or meeting-request opener to a senior colleague or external party."
    - "Common in business email where the writer is asking for a meeting."
  notes: |
    The double-register move (sonkeigo for the listener's time, kenjougo
    for the speaker's request) is the conventional formal-meeting-request
    shape. Reading this as obsequious misses the cultural function:
    keigo encodes the relative status of the conversation participants
    without burdening the surface content.
```

The `register` tag should be one of: `sonkeigo`, `kenjougo`, `teineigo`, `refusal-via-omission`, `soft-refusal`, `humble-acknowledgement`, `meeting-deferral`, `group-decision-deferral`, or add a new tag in your fork and document it. Loaders preserve unknown tags on round-trip per ADR 0007.

When you contribute back, please:

1. Include the Japanese (kanji/kana), romaji, and English literal in every entry.
2. Cite the context where the phrase routinely appears (formal email vs in-person meeting vs Slack; vertical relationship vs peer-to-peer).
3. Avoid pan-Japanese claims. "In manufacturing-sector keigo" is fine; "the Japanese always" is a caricature.
4. **Do not editorialise about Japanese speakers as "indirect" or "evasive."** Keigo's soft-refusal shapes are doing real social work: they preserve the relationship, defer the group-decision process appropriately, and avoid putting either party in a position of having to say or hear a bare "no." Translate the substantive content; do not score points about the convention.

## Eval coverage

A real translation-pack ships with its own eval corpus at `eval/corpus.yaml` per the [translation-pack contribution guide](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx). This plugin currently ships only the phrasebook and prompts; an eval corpus is the next contribution. Until eval coverage lands, this pack stays at `trust.level: community` and cannot graduate to `reviewed`.

## What this plugin is NOT

- It is not a Japanese-language tutorial. Keigo is a deep system; the pack covers a workplace-relevant sliver and assumes the reader has at least basic context.
- It is not a substitute for actual fluency or for working alongside Japanese colleagues over time. Register knowledge accumulates from exposure; the pack accelerates early calibration, it does not replace lived experience.
- It is not a claim that all Japanese workplaces communicate identically. Sector, company-size, generational, and individual variation are real. The entries describe common workplace defaults; your colleague's mileage will vary.
- It is not a stereotype. "The Japanese are indirect" is precisely the framing this pack is designed to refuse. Keigo's soft-refusal and omission patterns are doing real social work — preserving relationships, deferring to group-decision processes, sparing both parties the cost of bare confrontation. The pack helps non-Japanese readers see the substantive content behind those patterns without dismissing the patterns themselves.
- It does not aggregate any user data. Everything stays local to your `mcp-translation` install per the ADR 0005 privacy model.

## License

AGPL-3.0-or-later. Same as the substrate. See [`LICENSE`](./LICENSE).

## Further reading

- [`plugins/translation-legal/`](../translation-legal/) — sibling pack covering legal-profession idiom.
- [`plugins/translation-sales/`](../translation-sales/) — sibling pack covering sales / customer-success idiom.
- [`plugins/translation-hiberno-english/`](../translation-hiberno-english/) — sibling pack covering Hiberno-English softening.
- [`plugins/translation-german-directness/`](../translation-german-directness/) — sibling pack covering German workplace directness.
- [Plugin type — translation-pack](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx) — full contribution guide.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md) — manifest contract design rationale.
- [`plugins/README.md`](../README.md) — contributor reference for the `plugins/` directory.
