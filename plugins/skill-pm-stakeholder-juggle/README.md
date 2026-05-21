# skill-pm-stakeholder-juggle

A profession-shaped NeuroDock skill for the three things product managers actually do all week: see who cares about a feature, audit the decisions already made on a project (so you can stop re-litigating them), and write a verdict-first exec summary inside a tight word budget. Three trigger phrases, three flows, no overlap with `skill-eng-manager-1on1` or any general-purpose planning skill.

## Who this is for

- **Product managers** juggling five-to-fifteen stakeholders across two-to-five projects, trying to keep the political shape of each feature in their head.
- **Senior PMs and group PMs** auditing the decisions trail on a project before a quarterly review.
- **PMs with a tendency to re-litigate closed decisions** in their own head. The decision-audit flow is shaped for this — it surfaces the closed calls and names them as closed.
- **Anyone who has to write exec summaries inside a tight word budget.** The exec-summary flow enforces the budget; it does not negotiate with it.

It is **not** for:

- Stakeholder strategy or "engagement plans". This skill surfaces facts; it does not coach you on how to handle anyone.
- Performance reviews of stakeholders or anyone else. The skill never scores, rates, or ranks a person.
- Sentiment analysis. The skill does not infer anyone's mood from their facts.
- Sprint planning, roadmap planning, or any forward-looking planning. Different tool.

## What it does

Three activation paths. The trigger phrase determines the flow.

| Trigger                                                            | Flow            | What it produces                                                                                                                                                                             |
| ------------------------------------------------------------------ | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `who cares about <feature>` / `stakeholder map for <feature>`      | Stakeholder map | A map of proposers, blockers, endorsers, and recent context for the feature — built from facts in `neurodock-cognitive-graph`, with verbatim quotes and dates.                               |
| `audit my decisions on <project>` / `audit decisions on <project>` | Decision audit  | A temporally ordered list of every decision recorded against the project, ending with a verbatim anti-rumination closing line: `These decisions are closed. To reopen, open a new question.` |
| `exec summary for <topic>, max <N> words`                          | Exec summary    | A verdict-first 4-bullet summary (`Why now / What changed / Decision needed / Risk if delayed`) shaped by `neurodock-task-fractionator` and rendered within the named word budget.           |

See `SKILL.md` for the full operating instructions and triggers.

## What it explicitly does NOT do

- It does not score, rank, or rate any stakeholder.
- It does not produce influence maps, power-interest grids, or any quantification of stakeholder importance.
- It does not coach the user on stakeholder strategy ("here's how to win them over").
- It does not paraphrase facts from the graph. Verbatim or it doesn't appear.
- It does not soften or omit the Flow B closing line. The line is the point of Flow B.
- It does not negotiate the Flow C word budget. It tightens the prose until the budget fits.
- It does not use middle-management vocabulary (no `synergy`, `rockstar`, `10x`, `ninja`, `stretch goal`, `aligned`, `north star`, `circle back`, `actionable insights`).
- It does not call `record_fact` without explicit user opt-in. The cognitive graph is the user's notebook.

## Why these three flows together

These are the three recurring shapes of PM work that benefit from a structured tool but cannot be templated. Each one takes a messy human input (a vague feature reference, a project name, a topic the exec asked about) and produces a structured artifact (a stakeholder map, a decision audit, a summary). They share a posture: respect the political reality of the job, do not pretend it isn't there, do not moralise about it.

The decision-audit flow's anti-rumination close is particularly useful to OCD-prone PMs who re-litigate already-made decisions in their head. The flow surfaces the closed calls; the closing line names them as closed. The user remains the authority — the line itself says how to reopen any of them.

## Dependencies

| MCP server                    | Required? | Used for                                                                                                                                                     |
| ----------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `neurodock-cognitive-graph`   | **Hard**  | `recall_entity` for Flow A stakeholder maps, `recall_decisions` for Flow B audits. Without it the skill cannot run — there is no useful degraded mode.       |
| `neurodock-task-fractionator` | **Hard**  | `decompose` for Flow C exec summaries. The 4-bullet structure is shaped by the decompose call; without it Flow C cannot produce the verdict-first structure. |

Both requirements are declared in `plugin.yaml` under `requires.mcp_servers`. There is no soft-degraded mode. If the cognitive graph or the task-fractionator is unavailable, the substrate refuses to activate this skill and surfaces a structured warning.

## How to install

NeuroDock discovers plugins from two filesystem roots. To install for local testing:

**Per-user (recommended for trying it out):**

Linux:

```bash
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/skill-pm-stakeholder-juggle ~/.local/share/neurodock/plugins/
```

macOS:

```bash
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/skill-pm-stakeholder-juggle "$HOME/Library/Application Support/neurodock/plugins/"
```

Windows PowerShell:

```powershell
$dest = "$env:APPDATA\neurodock\plugins\skill-pm-stakeholder-juggle"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\skill-pm-stakeholder-juggle $dest
```

**In-repo (already done if you're reading this from the cloned repo):**

The substrate also scans `<repo>/plugins/*/plugin.yaml`, so cloning this repo is enough — no copy needed.

Restart your LLM client (Claude Desktop, Claude Code). The substrate scans both roots at init.

To verify discovery:

```bash
neurodock plugin list
```

The plugin should appear with `trust: community` and the three triggers listed above.

## How to use

Once installed, just say one of the trigger phrases in your normal LLM client. The skill is profile-agnostic (`neurotypes: []`) so it auto-activates for any user whose profile allows community plugins.

Examples:

> Who cares about the new export pipeline?

> Audit my decisions on the migration-q2 project.

> Exec summary for the cache outage last Tuesday, max 120 words.

The skill replies with a stakeholder map, a decision audit, or an exec summary (respectively). It does not propose follow-up questions, ask "anything else?", or otherwise extend the conversation. When the artifact is ready, the skill stops.

## When NOT to use it

- **You're planning the next quarter's roadmap.** Different flow. This skill operates on what is already in the graph; it does not generate a roadmap.
- **You want a stakeholder strategy or engagement plan.** This skill surfaces facts; it does not coach. Use a general-purpose planning or strategy skill.
- **You want a polished narrative deck or board memo.** Use a writing skill. Flow C produces an exec summary, not a deck.
- **The decision you want to reopen has new information.** Don't audit; start the conversation. Flow B is for closed calls, not for active deliberation.

## Pairing with other skills

- Pair with `adhd-daily-planner` (in-tree) for a morning brief that points at the projects with open exec asks, then chain `exec summary for <topic>` for each.
- Pair with `audhd-context-recovery` (in-tree) when returning from a long absence — `where was I` first to reconstruct project state, then `audit my decisions on <project>` to remember what is already closed.
- Pair with `ocd-decision-finalizer` (in-tree) if your profile has `ocd` self-IDed — the two skills layer naturally, with this skill providing the audit and `ocd-decision-finalizer` providing the finality response on re-validation triggers.

## Trigger phrasing — why these and not others

The trigger phrases are PM-specific and chosen NOT to collide with `skill-eng-manager-1on1`:

- `who cares about <feature>` is unambiguous PM phrasing. An engineering manager would say `who's blocking the migration` or `who owns the cache layer` — different shape, different skill.
- `audit my decisions on <project>` is decision-language, not 1:1-language. The eng-manager skill uses `prep my 1:1 with <name>` — orthogonal.
- `exec summary for <topic>, max <N> words` is exec-facing PM work. The eng-manager skill has no equivalent. There is no overlap.

If a future skill needs a similar trigger, it must pick a different prefix. We do not overload trigger phrases.

## Tests

Three replayable conversation tests in `tests/` cover the three flows end-to-end. Same format as `plugins/example-skill-pomodoro/tests/`. Run them with:

```bash
neurodock skill test plugins/skill-pm-stakeholder-juggle
```

(Available once the reference replay harness ships with `@neurodock/skill-sdk`.)

The key hard-asserted properties:

- Test 01: facts are quoted verbatim from the graph, bucketed by predicate, never paraphrased.
- Test 02: the closing line `These decisions are closed. To reopen, open a new question.` appears verbatim, last, and in full.
- Test 03: the rendered exec summary's word count fits inside the user's named budget, and `decompose` is called with a topic that explicitly names the 4-section structure.

## License

AGPL-3.0-or-later. See [`LICENSE`](./LICENSE).

## Further reading

- [`SKILL.md`](./SKILL.md) — operating instructions for the three flows.
- [`plugin.yaml`](./plugin.yaml) — manifest.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md).
- [MANIFESTO.md](../../MANIFESTO.md) — the project's ethics commitments. This skill's "respect the political shape of PM work, don't moralise about it" posture is grounded there.
