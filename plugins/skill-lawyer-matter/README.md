# skill-lawyer-matter

A profession-shaped NeuroDock skill for lawyers, in-house counsel, and paralegals juggling multiple matters at once. Three trigger phrases, three flows, no overlap with the general-purpose planning skills.

## NO LEGAL ADVICE

**This is a workflow tool for legal professionals, not a substitute for legal judgment.** It surfaces what you have already recorded, in the structure a senior lawyer expects. It does not interpret statute, predict litigation outcomes, draft pleadings, or render any opinion on the merits. Every output is your own facts re-presented — never the skill's analysis of those facts. If you are not a qualified legal professional, this skill is not for you and its output is not advice.

The skill is deliberately constrained:

- Operational-effect descriptions for terms of art always end with the word `typically`. The skill will not assert that any phrase definitively creates or extinguishes a legal right.
- The skill never proposes a reply, drafts a motion, or recommends a strategic action.
- The skill never uses the words `should`, `must`, `obligated`, `liable`, `entitled`, `actionable`, or `merits` in its own commentary (it will preserve those words when they appear in user-recorded facts it is quoting verbatim).

## Who this is for

- **Lawyers in private practice** managing five-to-fifty active matters and trying to keep track of deadlines, opposing counsel, and the latest filing across all of them.
- **In-house counsel** triaging incoming requests across multiple business units and needing fast briefs on what each matter is about.
- **Paralegals** preparing the partner for a meeting on a matter they haven't touched in two weeks.
- **Anyone reading hedged correspondence from opposing counsel or outside counsel** who wants the literal subtext surfaced quickly.

It is **not** for:

- Pro se litigants, members of the public, or anyone seeking legal advice. The skill is not advice.
- Legal research. It does not look up case law, statute, or regulations.
- Docketing. It surfaces deadlines you have recorded; it is not a court-rules calendaring product.
- Drafting. It does not produce pleadings, motions, contracts, or correspondence.

## What it does

Three activation paths. The trigger phrase determines the flow.

| Trigger                                | Flow              | What it produces                                                                                                                                                                                                  |
| -------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matter brief: <matter name>`          | Matter brief      | A structured brief built from prior context in `neurodock-cognitive-graph` — deadlines (with days-remaining, `PAST DEADLINE` flagged in caps), opposing counsel, latest filing, outstanding tasks, related items. |
| `deadline check for the next <N> days` | Deadline check    | An ordered list of deadlines within the forward window. Past deadlines are flagged with the literal string `PAST DEADLINE` in capitals — never softened.                                                          |
| `translate this email for me`          | Email translation | Literal subtext plus register classification, applying the `translation-legal` pack if installed. Falls back to an in-skill literal pass if the pack is unavailable.                                              |

See `SKILL.md` for the full operating instructions and triggers.

## What it explicitly does NOT do

- It does not give legal advice. Ever.
- It does not interpret statute, predict outcomes, or render opinions on the merits.
- It does not draft pleadings, motions, contracts, or correspondence.
- It does not soften `PAST DEADLINE`. The literal string in capitals is non-negotiable.
- It does not paraphrase facts returned by the cognitive graph — they are quoted verbatim.
- It does not assert binding legal effect for any term of art (every operational-effect description ends with `typically`).
- It does not call `record_fact` without explicit user opt-in. The cognitive graph is your notebook.

## Why these three flows together

These are the recurring tasks a lawyer or paralegal runs through the working day that benefit from structure but cannot be templated. They share a common shape: take messy structured input (facts the user already recorded, an incoming email written in hedged register), produce a structured artifact the user can act on, then stop. The skill is profession-shaped — factoring each flow into its own plugin would split a workflow the user thinks of as one tool.

## Dependencies

| MCP server                  | Required? | Used for                                                                                                                                                                                                                            |
| --------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neurodock-cognitive-graph` | **Hard**  | `recall_entity` (matter brief + deadline scan), `recall_decisions` (filings ordered by date), `record_fact` (only on explicit user opt-in). Without it, neither the matter-brief nor the deadline-check flow has a source of truth. |
| `mcp-translation`           | Optional  | `translate_incoming` for Flow C. Without it, the skill falls back to an in-skill literal-translation prompt.                                                                                                                        |

| Plugin pairing      | Coupling  | Used for                                                                                                                                                                                                                                                                                                                         |
| ------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `translation-legal` | Soft pair | Applied on top of `mcp-translation` for Flow C. Surfaces British-firm hedge-speak, US BigLaw transactional idiom, and terms of art (`without prejudice`, `subject to contract`, etc.) with operational-effect notes ending in `typically`. Without it, Flow C falls back to a generic literal pass with a one-line install hint. |

The hard requirement on `neurodock-cognitive-graph` is declared in `plugin.yaml` under `requires.mcp_servers`. The optional `mcp-translation` integration is declared in `SKILL.md` frontmatter with `optional: true` and gated behind an availability check at activation time. The `translation-legal` plugin pairing is declared in `SKILL.md` frontmatter (`plugin_dependencies`) and documented here — the v0.1.0 plugin schema does not carry an `optional` flag on `requires.plugins[]` entries, so hard-declaring it would gate the skill's load on its presence, which we do not want.

## Recording facts for the skill to read

The skill is only as useful as the facts you have recorded. The cognitive graph's `record_fact` tool is the entry point. For Flow A (matter brief) and Flow B (deadline check), the skill expects facts recorded against a matter entity (type `project`) with the following conventions:

- **Deadlines.** `predicate: "tagged"`, `object.literal: "deadline:<ISO date>:<description>"`. Example: `deadline:2026-06-15:reply brief to opposing counsel's MTD`.
- **Opposing counsel.** `predicate: "mentioned_in"`, `object.literal: "opposing counsel:<firm/name>"`. Example: `opposing counsel: Smith & Jones LLP — lead: J. Smith`.
- **Filings.** `predicate: "decided_in"` or `predicate: "mentioned_in"`, `object.literal: "filed:<date>:<description>"`. Example: `filed:2026-05-10: reply to MTD`.
- **Outstanding tasks.** `predicate: "blocked_by"` or `predicate: "depends_on"`, `object.literal: "<task description>"`.

These are conventions, not hard requirements — the skill reads whatever `recall_entity` returns. But adopting the conventions means the matter-brief output stays clean and the deadline check works without per-matter configuration.

## How to install

Use the NeuroDock CLI (requires `@neurodock/cli` ≥ 0.4.0). Run from the repo root:

```sh
# Install
neurodock plugin add ./plugins/skill-lawyer-matter

# Activate
neurodock plugin enable skill-lawyer-matter

# Restart your MCP client (Claude Desktop, Claude Code, Cursor)

# Verify
neurodock plugin list
```

The plugin should appear with `trust: community` and the three triggers listed above. `plugin validate ./plugins/skill-lawyer-matter` will check the manifest before install if you want to dry-run.

For the full Flow C experience, also install the paired translation pack:

```sh
neurodock plugin add ./plugins/translation-legal
neurodock plugin enable translation-legal
```

<details>
<summary>Manual install per OS (if you don't have the CLI yet)</summary>

Linux:

```bash
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/skill-lawyer-matter ~/.local/share/neurodock/plugins/
# For the full Flow C experience:
cp -r plugins/translation-legal ~/.local/share/neurodock/plugins/
```

macOS:

```bash
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/skill-lawyer-matter "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/translation-legal "$HOME/Library/Application Support/neurodock/plugins/"
```

Windows PowerShell:

```powershell
$dest = "$env:APPDATA\neurodock\plugins\skill-lawyer-matter"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\skill-lawyer-matter $dest
Copy-Item -Recurse plugins\translation-legal "$env:APPDATA\neurodock\plugins\translation-legal"
```

The substrate also scans `<repo>/plugins/*/plugin.yaml`, so cloning this repo without copying is enough for in-repo discovery. Restart your LLM client either way.

</details>

## How to use

Once installed, just say one of the trigger phrases in your normal LLM client. The skill is profile-agnostic (`neurotypes: []`) so it auto-activates for any user whose profile allows community plugins.

Examples:

> matter brief: Acme Corp v Beta Holdings

> deadline check for the next 14 days

> translate this email for me
>
> [paste email]

The skill replies with a structured brief, an ordered deadline list, or a translation breakdown. It does not propose follow-up questions, ask "anything else?", or otherwise extend the conversation. When the artifact is ready, the skill stops.

## When NOT to use it

- **You need legal advice.** This skill is not advice. It is a workflow tool for qualified legal professionals.
- **You're researching the law.** Different tool. This skill operates on facts you have already recorded.
- **You want a court-rules calendaring product.** This skill surfaces deadlines you recorded; it does not compute them from rules.
- **You want a drafting assistant.** Different tool. This skill does not draft.

## Pairing with other skills

- Pair with `translation-legal` (in-tree) for the full Flow C experience — the pack surfaces ambiguity spans, terms of art with operational-effect notes ending in `typically`, and a recommended-next-action surface.
- Pair with `adhd-daily-planner` (in-tree) if you want a morning brief that lists today's deadlines across matters so you can chain into individual `matter brief:` calls.
- Pair with `audhd-context-recovery` (in-tree) when returning from a long absence — `where was I` first to reconstruct project state, then `matter brief:` on each active matter.

## Tests

Three replayable conversation tests in `tests/` cover the three flows end-to-end. Same format as `plugins/example-skill-pomodoro/tests/`. Run them with:

```bash
neurodock skill test plugins/skill-lawyer-matter
```

(Available once the reference replay harness ships with `@neurodock/skill-sdk`.)

## License

AGPL-3.0-or-later. See [`LICENSE`](./LICENSE).

## Further reading

- [`SKILL.md`](./SKILL.md) — operating instructions for the three flows.
- [`plugin.yaml`](./plugin.yaml) — manifest.
- [`../translation-legal/`](../translation-legal/) — the translation pack this skill pairs with.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md).
- [MANIFESTO.md](../../MANIFESTO.md) — the project's ethics commitments. The "no legal advice, no softening of PAST DEADLINE, no paraphrasing of user-recorded facts" posture is grounded there.
