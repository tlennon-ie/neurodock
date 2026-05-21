# skill-software-engineer-daily

A profession-shaped NeuroDock skill for the three things an individual-contributor software engineer actually does in a working day: prep a code review on a specific PR or file using prior context, plan a deep-work block of explicit length, and write the three-line async standup from recorded facts. Three narrow trigger phrases, three flows, no overlap with the general-purpose planning skills.

## Who this is for

- **IC software engineers** running their own daily working rhythm — picking what to review, what to focus deeply on, and what to say in the async standup.
- **Senior engineers and staff+ ICs** who write code most days and need a working tool rather than a management dashboard.
- **ND engineers in particular** who produce excellent work in fewer-but-deeper sessions and want a tool that supports that shape of work, not one that pushes throughput.

It is **not** for:

- Engineering managers running a team — that is `skill-eng-manager-1on1`'s job.
- Sprint planning across a team or across multiple days — this skill plans a single block.
- Code review itself. This skill prepares you to review by surfacing prior context; it does not read the diff or flag bugs.
- Productivity hacking, ship-faster coaching, or any "10x your output" framing. The skill respects the work and does not push throughput.

## What it does

Three activation paths. The trigger phrase determines the flow.

| Trigger                                     | Flow             | What it produces                                                                                                                                                        |
| ------------------------------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prep my code review on <PR or file>`       | Code-review prep | A short brief listing prior reviewer comments and prior decisions for that target from `neurodock-cognitive-graph` — what to focus on, bounded to what the graph knows. |
| `plan my deep-work block, I have <N> hours` | Deep-work block  | 3–5 atomic engineering tasks with acceptance criteria from `neurodock-task-fractionator`, plus a one-line verdict on what to tackle FIRST.                              |
| `async standup writeup`                     | Async standup    | The Yesterday / Today / Blockers three-line format, populated from yesterday's recorded facts via `weekly_rollup`. No invented activity, no praise language.            |

See `SKILL.md` for the full operating instructions and triggers.

## What it explicitly does NOT do

- It does not invent reviewer comments, prior decisions, yesterday's activity, today's plan, or blockers. Everything in every artifact is traceable to something the graph returned.
- It does not read or summarise the diff in the review-prep flow. The diff is the user's job; the brief is bounded to graph context.
- It does not push throughput. No "10x", "ship faster", "crush it", "power through", "rockstar", "ninja", or "stretch goal".
- It does not praise the user for yesterday. No "nice work yesterday", no "great work", no sympathy theatre.
- It does not propose what to do after a flow ends. The artifact is the deliverable; the skill stops.
- It does not call `record_fact` without explicit user opt-in. The cognitive graph is the user's notebook.

## Why these three flows together

These are the things an IC software engineer does most working days: open a PR and try to remember what was already discussed about it, sit down for a deep block of work and have to decide what to actually do first, and write a one-paragraph standup in the team channel before logging off. They share a common shape: take a small amount of structure (a target, a time budget, a date window) plus what the graph already remembers, and produce a small artifact the user acts on, then stop. The skill is profession-shaped — an IC who wants one of the three usually wants the others.

## Dependencies

| MCP server                    | Required? | Used for                                                                                                                                                          |
| ----------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `neurodock-cognitive-graph`   | **Hard**  | `recall_entity` for Flow A (prior reviewer comments and decisions on the target) and `weekly_rollup` for Flow C (yesterday's facts and open sessions).            |
| `neurodock-task-fractionator` | **Hard**  | `decompose` for Flow B (turning the open work into 3–5 atomic tasks that fit the budget). Without it, the deep-work flow cannot run.                              |
| `neurodock-chronometric`      | Optional  | `mark_session_start` / `mark_session_end` for users who want to time-box the deep-work block. The skill works without it and degrades silently when it is absent. |

The two hard requirements are declared in `plugin.yaml` under `requires.mcp_servers`. The optional integration is declared in `SKILL.md` frontmatter with `optional: true` and is gated behind an availability check in the operating instructions.

## How to install

NeuroDock discovers plugins from two filesystem roots. To install for local testing:

**Per-user (recommended for trying it out):**

Linux:

```bash
mkdir -p ~/.local/share/neurodock/plugins/
cp -r plugins/skill-software-engineer-daily ~/.local/share/neurodock/plugins/
```

macOS:

```bash
mkdir -p "$HOME/Library/Application Support/neurodock/plugins/"
cp -r plugins/skill-software-engineer-daily "$HOME/Library/Application Support/neurodock/plugins/"
```

Windows PowerShell:

```powershell
$dest = "$env:APPDATA\neurodock\plugins\skill-software-engineer-daily"
New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null
Copy-Item -Recurse plugins\skill-software-engineer-daily $dest
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

> Prep my code review on PR #482.

> Plan my deep-work block, I have 2 hours.

> Async standup writeup.

The skill replies with a review-focus brief, a deep-work plan, or the three-line standup (respectively). It does not propose follow-up questions, ask "anything else?", or otherwise extend the conversation. When the artifact is ready, the skill stops.

## When NOT to use it

- **You are managing a team.** Use `skill-eng-manager-1on1` for 1:1 prep, sprint-review decomposition, and blameless postmortems.
- **You want to plan an entire sprint.** Different flow. This skill plans a single deep-work block bounded by a single time budget.
- **You want code-review feedback on the diff itself.** This skill does not read the diff; it surfaces what the graph already remembers about the target so you know where to look.
- **You want the skill to write a status email or pitch.** Use a general-purpose writing skill. This one is for the work, not for the optics.

## Pairing with other skills

- Pair with `adhd-daily-planner` (in-tree) if you want a morning brief that surfaces "you have a deep block at 10am" so you can chain into `plan my deep-work block, I have 2 hours`.
- Pair with `audhd-context-recovery` (in-tree) when returning from a long absence — `where was I` first to reconstruct the project state, then `prep my code review on <PR>` for the open review.
- Pair with `skill-eng-manager-1on1` if you wear both hats (some staff+ ICs do): the manager skill handles 1:1s; this one handles your own daily work.

## A note on tone

The skill is written for engineers who often produce their best work in fewer-but-deeper sessions, and who are tired of tools that frame that as a problem to fix. The deep-work flow does not push you to schedule more blocks. The standup flow does not praise you for yesterday or chide you for short Yesterday lists. The review-prep flow does not editorialise about the PR. The flows do what they say and then stop.

## Tests

Three replayable conversation tests in `tests/` cover the three flows end-to-end. Same format as `plugins/skill-eng-manager-1on1/tests/`. Run them with:

```bash
neurodock skill test plugins/skill-software-engineer-daily
```

(Available once the reference replay harness ships with `@neurodock/skill-sdk`.)

## License

AGPL-3.0-or-later. See [`LICENSE`](./LICENSE).

## Further reading

- [`SKILL.md`](./SKILL.md) — operating instructions for the three flows.
- [`plugin.yaml`](./plugin.yaml) — manifest.
- [ADR 0007 — Plugin protocol](../../docs/decisions/0007-plugin-protocol.md).
- [MANIFESTO.md](../../MANIFESTO.md) — the project's ethics commitments. This skill's "no productivity theatre, no invented activity" posture is grounded there.
