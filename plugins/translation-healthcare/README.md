# translation-healthcare

A NeuroDock `translation-pack` plugin that tunes [`mcp-translation`](../../packages/mcp-translation/) for the way clinicians communicate with each other.

> **What this is for.** When you read "patient is stable on a background of failed conservative therapy, for review, ?sepsis, plan as per medics" and don't immediately know whether that's a calm note or a quiet alarm, this pack is the missing dictionary. It maps the compressed, hedged, euphemism-laden register of clinical handover to plain language — with the subtext spelled out.

## Who it's for

- **Neurodivergent clinicians** — particularly autistic and ADHD doctors, nurses, AHPs, and paramedics — who find the unstated rules of SBAR, MDT, and ward-round register cognitively expensive to decode in real time.
- **Allied health staff** (physio, OT, SLT, dietetics, pharmacy) entering a medical conversation in which the medical team uses register the rest of the room does not share.
- **Paralegals and clinical-negligence solicitors** reading hospital records who need to understand whether "comfort measures only" was an end-of-life decision (yes) and whether "for review" means "decided" (no).
- **Social workers and discharge coordinators** attending case conferences where "acopia" and "complex discharge" carry very different operational meanings.
- **New joiners and rotating staff** — locums, agency staff, returners — who need to come up to speed on a register that varies by ward, by specialty, and by region.

This is **not a substitute for clinical training**. It is a reading aid for register. The literal translations describe what a phrase _typically_ means in inter-clinician context; the actual clinical situation always depends on the patient in front of you, the local protocols, and the judgement of the team.

## What it covers

This pack contains:

- **`phrases.yaml`** — a phrasebook of clinical-team idiom (≥ 18 entries) drawn from SBAR handovers, MDT discussions, ED triage, ward rounds, and GP-to-specialist correspondence. Each entry maps a phrase to a plain-language translation, a register tag (`sbar-handoff`, `severity-euphemism`, `differential-language`, `clinical-plan`), and example context.
- **`prompts/literal_meaning.md`** — the literal-meaning prompt override for `mcp-translation`. Loads the phrasebook and instructs the model to surface direct translations of clinical-register phrases without flattening their function (e.g. don't collapse "comfort measures only" into "the patient is being kept comfortable" — explain that active disease-directed treatment has stopped).
- **`prompts/subtext.md`** — the subtext prompt override. Identifies common patterns: severity euphemisms (where the register is calibrated against discoverability), differential-diagnosis hedging, SBAR compression, and decision-ownership signals.
- **`prompts/tone.md`** — the tone prompt override. Rewrites outgoing messages toward the clinical-team register when the user is corresponding with another clinician (e.g. referral letters, handover notes) and wants the register to match the expectations of the receiving team. **Does not** generate clinical content the user did not write.

## Install

Use the NeuroDock CLI (requires `@neurodock/cli` ≥ 0.4.0). Run from the repo root:

```sh
# Install
neurodock plugin add ./plugins/translation-healthcare

# Activate
neurodock plugin enable translation-healthcare

# Restart your MCP client (Claude Desktop, Claude Code, Cursor)

# Verify
neurodock plugin list
```

`plugin add` copies the directory into `$XDG_DATA_HOME/neurodock/plugins/translation-healthcare/` (with platform fallbacks for macOS and Windows). `plugin validate ./plugins/translation-healthcare` will check the manifest before install if you want to dry-run.

<details>
<summary>Manual install per OS (if you don't have the CLI yet)</summary>

```bash
# Linux
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/translation-healthcare ~/.local/share/neurodock/plugins/

# macOS
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/translation-healthcare "$HOME/Library/Application Support/neurodock/plugins/"
```

```powershell
# Windows PowerShell
$dest = "$env:APPDATA\neurodock\plugins\translation-healthcare"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\translation-healthcare $dest
```

</details>

## Regional variance

Clinical register is broadly shared across English-speaking health systems but specific tokens vary. A non-exhaustive list of differences this pack does **not** attempt to resolve:

- **Abbreviations.** "NAD" is universal but the underlying preferred long form differs ("no acute distress" in US-leaning charts, "no abnormality detected" historically in UK-leaning labs). "PRN" is universal; "stat" is regional. The pack flags abbreviations in the phrasebook and explains the most common meaning.
- **Decision-ownership phrasing.** "Discussed with [senior]" maps to different governance regimes (consultant vs. attending vs. responsible clinician) depending on system. The pack translates the function, not the local title.
- **Triage and severity scoring.** Phrases like "for review" and "soft signs" sit alongside early-warning-score systems (NEWS2, MEWS, PEWS, qSOFA) that differ between countries. The pack translates the prose, not the score.
- **Discharge and disposition language.** "Acopia" is largely UK / Ireland / Australia; US charts more often use "failure to thrive in adult" or "complex discharge planning." The pack uses the most widely recognised term and flags the variance.

Forks targeting a single health system (NHS, HSE, Medicare, NHS-Australia, Canadian health systems, etc.) SHOULD narrow `locale` to the relevant BCP 47 tag (e.g. `en-GB`, `en-IE`, `en-US`, `en-AU`, `en-CA`) and add region-specific entries. The base pack ships as `locale: en` to keep the starting corpus broadly useful.

## How to extend the phrasebook

The phrasebook in `phrases.yaml` is intentionally a starting set, not a comprehensive medical dictionary. Real clinical idiom varies by specialty, ward, and region. To add an entry, follow the existing shape:

```yaml
- phrase: "Watchful waiting"
  literal: "Active monitoring without intervention; re-assess at defined intervals; act if the situation changes."
  register: clinical-plan
  context:
    - "Surveillance of early-stage cancer, asymptomatic aneurysm, or stable nodule."
    - "Decision deferred pending more information."
  notes: |
    Differs from "conservative management" — watchful waiting implies
    structured surveillance with planned reassessment, not declining
    treatment.
```

The `register` tag should be one of: `sbar-handoff`, `severity-euphemism`, `differential-language`, `clinical-plan`, or add a new tag in your fork and document it. Loaders preserve unknown tags on round-trip per ADR 0007.

When you contribute back, please:

1. Cite the context where the phrase routinely appears (specialty, document type, role).
2. Avoid making diagnostic claims. "Often used when X is suspected" is fine; "X means the patient has Y" is a claim that needs to come from clinical sources, not a translation pack.
3. Flag regional variance in `notes` when the same phrase carries meaningfully different weight elsewhere.
4. Do not name patients, real cases, or identifying details. Use neutral, illustrative context only.

## Eval coverage

A real translation-pack ships with its own eval corpus at `eval/corpus.yaml` per the [translation-pack contribution guide](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx). This plugin currently ships only the phrasebook and prompts; an eval corpus (with synthetic, fully de-identified examples drawn from public training material such as published SBAR templates and open-access case studies) is the next contribution. Until eval coverage lands, this pack stays at `trust.level: community` and cannot graduate to `reviewed`.

## What this plugin is NOT

- **Not a diagnostic tool.** The phrasebook describes how clinicians talk about diagnoses; it does not make diagnoses. "Likely viral" means the documenting clinician concluded antibiotics are not indicated — it does not mean the pack believes the patient's illness is viral.
- **Not for patient-facing copy.** Clinical-team register is calibrated for an audience of colleagues who share training and context. Using these phrases verbatim with patients or families is at best opaque and at worst harmful. Patient-facing materials need a different register and, for many use cases, accessibility review and clinician sign-off.
- **Not a substitute for clinical judgment.** A "reassuring exam" is reassuring against red flags only. "Patient is stable" describes a point-in-time status, not a prognosis. The literal translations describe register convention; the actual clinical decision always depends on the patient, the team, and the local protocols.
- **Not a substitute for clinical training.** Reading this pack does not qualify anyone to interpret clinical records for decision-making purposes. It is a register aid for people who already need to read these records (paralegals, social workers, allied health) or who need to communicate in this register (ND clinicians).
- **Not legal or regulatory advice on documentation.** Charting standards (what must be documented, by whom, in what format) are set by local policy and regulators, not by a translation pack.
- **Not jurisdiction-specific.** "Comfort measures only" and "not for escalation" map to specific ceiling-of-treatment frameworks (RESPECT, ReSPECT, POLST, etc.) that differ between jurisdictions. The pack translates the register, not the local framework.
- **Does not aggregate any user data.** Everything stays local to your `mcp-translation` install per the ADR 0005 privacy model. No patient data, no clinician data, no chart contents leave the device.

## License

AGPL-3.0-or-later. Same as the substrate. See [`LICENSE`](./LICENSE).

## Further reading

- [`plugins/translation-legal/`](../translation-legal/) — sibling pack covering legal-profession idiom.
- [`plugins/translation-sales/`](../translation-sales/) — sibling pack covering sales / customer-success idiom.
- [Plugin type — translation-pack](../../docs/src/content/docs/contribute/plugin-types/translation-pack.mdx) — full contribution guide.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md) — manifest contract design rationale.
- [`plugins/README.md`](../README.md) — contributor reference for the `plugins/` directory.
