# code-review-workflow

A worked walkthrough for an IC engineer running a 90-minute PR-review block. Combines `neurodock-chronometric` (session bracketing + the 75-minute hyperfocus nudge), `neurodock-cognitive-graph` (recall of prior reviewer comments on the changed files), and `hyperfocus-formatter` (verdict-first comment shaping). NeuroDock does **not** read the code — the human still does the review. The substrate just makes the review block less expensive.

## Who this is for

- **IC engineers — especially senior+ — who do many reviews per week and find them taxing.** A 90-minute block of close reading is the most expensive thing many seniors do all week. The substrate is here to lower the activation cost, hold the timer, and surface what you already thought about the touched files last time.
- **Engineers with ADHD, AuDHD, or dyslexia** for whom the activation hump of "open the PR, find context, recall prior conversations, structure the comment" is itself the bottleneck — not the act of judging the code. The hyperfocus-formatter shape (verdict line first, then reasoning) maps cleanly onto how a good review comment should already read.
- **Tech leads or staff engineers reviewing across many repos** who lose continuity between reviews of the same file by different authors. The cognitive graph anchors the file, not the PR — so a comment you left on `auth/session.py` six weeks ago surfaces when the next change to `auth/session.py` lands.
- **Engineers mentoring a junior** who want to layer in the `skill-eng-manager-1on1` framing when the review is also coaching.

It is **not** for:

- Auto-reviewing PRs. NeuroDock does not read the diff. The substrate cannot tell you whether the code is correct. It can only tell you what you previously thought about these files, hold a session timer, and shape the comments you write into a verdict-first form. **The human does the review.**
- Replacing your code-host's review UI. You still leave comments in GitHub / GitLab / Gerrit / Reviewable / wherever. The substrate runs alongside.
- Performance scoring. There is no "you reviewed 4 PRs today" line. That is an anti-feature.

## What you will set up

A review-block prompt that, when pasted into Claude Desktop or Claude Code with the three NeuroDock MCP servers connected, triggers this sequence:

1. **Session marking** via `mcp-chronometric.mark_session_start` — anchors the review block to a stated intent like `"review PR #482"`.
2. **Prior-comment recall** via `mcp-cognitive-graph.recall_entity` for each changed file in the PR — surfaces comments you (or anyone on the team using the same graph) previously left on that file.
3. **Decision recall** via `mcp-cognitive-graph.recall_decisions` for the project — surfaces prior decisions that the current PR might be touching or contradicting.
4. **Verdict-first comment shaping** via `hyperfocus-formatter` — every comment you draft inside the session is reshaped so the verdict line lands first, reasoning follows. The skill activates passively on every response and aggressively (Tier B) on the design-critique-style phrase triggers that include code review.
5. **A hyperfocus-aware break suggestion** at the 75-minute threshold via `request_break_if_needed` — one line, once, after which you decide whether to keep going or break.
6. **A session-end recap** via `mark_session_end` plus `record_fact` — the verdict you reached on the PR is recorded against the project so the next review of the same file surfaces it.

Optionally pair with `plugins/skill-eng-manager-1on1/` when the review is also coaching a direct report — the same graph means a coaching note you record during the review surfaces in your next 1:1 prep.

## One-time setup

### 1. Pick a profile

For a PR-review block the relevant preferences are `output_format: answer_first` (so verdict-first shaping is on), a tight `max_chunk_size`, and a `hyperfocus_break_minutes` you actually believe. Overlay your neurotype preset on top of the eventual `software-engineer-daily` profile pattern (the `plugins/skill-software-engineer-daily/` skill ships the prompt shapes; the profile values come from one of the presets below).

| Profile                         | Pick this if                                                                                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles/adhd.yaml`            | You self-identify with ADHD. `max_chunk_size: 5`, `hyperfocus_break_minutes: 75`. Good default for review blocks because 75 minutes is roughly the upper bound of one good review. |
| `profiles/audhd.yaml`           | You self-identify with both ADHD and autistic traits. Tighter chunk size, motion reduced, output answer-first. Verdict line lands harder.                                          |
| `profiles/dyslexic.yaml`        | You self-identify with dyslexia and want short bullets, Atkinson Hyperlegible hint, and verdict-first shaping. `max_chunk_size: 4`.                                                |
| `profiles/low-stimulation.yaml` | You want the calmest possible default regardless of label. Use as a fallback.                                                                                                      |

Copy your pick to `~/.neurodock/profile.yaml`:

**macOS/Linux:**

```bash
cp profiles/adhd.yaml ~/.neurodock/profile.yaml
```

**Windows PowerShell:**

```powershell
New-Item -ItemType Directory -Force -Path "$HOME\.neurodock" | Out-Null
Copy-Item profiles\adhd.yaml "$HOME\.neurodock\profile.yaml"
```

If a future `profiles/software-engineer-daily.yaml` preset ships (tracked by the parallel `plugins/skill-software-engineer-daily/` work), prefer it as the base and overlay the neurotype-specific values on top. For now, the neurotype presets are the floor.

### 2. Verify

```bash
neurodock profile show
```

You should see `output_format: answer_first`, your `max_chunk_size`, and `hyperfocus_break_minutes`. If those three aren't right, the rest of this walkthrough won't shape the way it should.

### 3. Confirm the three MCP servers are wired

This walkthrough assumes the three NeuroDock MCP servers are configured in your client:

- `neurodock-mcp-chronometric`
- `neurodock-mcp-cognitive-graph`
- `neurodock-mcp-task-fractionator` _(not used in the review flow itself; declared because `skill-software-engineer-daily` requires it for its other flows — deep-work-block and standup. Leave it wired.)_

If you do not yet have those wired, run through `examples/claude-desktop/` first.

## The review prompt

Paste this into a fresh Claude conversation when you sit down to a review block. Replace the PR URL and the file list. The phrasing matters because the hyperfocus-formatter's design-critique phrase triggers include "review", "critique", and "walk through" — using one of those words forces Tier B shaping regardless of session length, which is what you want for a review.

> I'm starting a 90-minute review block on PR <url>. The files changed are: `<file1>`, `<file2>`, `<file3>`. Recall any prior comments I left on those files and any prior decisions in this project that might be relevant. Mark a session with intent "review PR <id>". Then walk through the PR with me — shape every review comment I draft verdict-first.

If you do not want session marking (e.g. you're in the middle of an existing session you don't want closed), drop the middle clause:

> I'm reviewing PR <url>. Files: `<file1>`, `<file2>`. Recall prior comments on those files and prior decisions on this project. Shape my comments verdict-first.

You can save the prompt as a slash command — the literal text is reproducible because all the variability lives in the URL, file list, and the MCP servers' state.

## What happens under the hood

When Claude receives the review prompt with the NeuroDock MCP servers connected, it walks roughly this sequence. Order matters because step 1 anchors the session timer, and the timer is what drives the break nudge at step 5.

1. **Session marking.** Calls `mcp-chronometric.mark_session_start({intent: "review PR <id>"})`. Returns a `session_id`. If a prior session was open (you forgot to close yesterday's), it is `auto_closed` per the profile's `session_overlap_policy`. The session length starts ticking.

2. **Per-file recall.** For each file in the PR, calls `mcp-cognitive-graph.recall_entity({type: "file", name: "<path>"})`. Three outcomes per file:

   - **Hit with prior comments** — surfaces them verbatim, dated, with the source session id. Useful when you reviewed the same file two weeks ago and left a comment that still applies.
   - **Hit with no comments, only decisions** — file is known, but you haven't reviewed it before. Surfaces the related decisions instead.
   - **Empty** — the file is new to your graph. Says so plainly. **The first review of the day, and any review of a brand-new file, will often hit this path.** That is not a substrate failure; it is honest.

3. **Decision recall.** Calls `mcp-cognitive-graph.recall_decisions({project: "<inferred from PR url or asked>"})`. Surfaces the top 3 most recent decisions on the project. Helps catch the case where the PR contradicts something you already decided — e.g. "we agreed not to put business logic in the auth layer" and this PR puts business logic in the auth layer.

4. **Verdict-first comment shaping.** The `hyperfocus-formatter` skill is on passively the whole session. The word "review" in the prompt triggers Tier B (aggressive Answer-First) from turn one. Every comment you draft inside the session comes back shaped as:

   ```
   Don't merge: <one-line reason>.

   - <reasoning bullet 1>
   - <reasoning bullet 2>
   - <reasoning bullet 3>
   ```

   (Or `Approve: …`, `Approve with nits: …`, `Iterate: …` — the verdict is whichever fits.) Up to `max_chunk_size` bullets visible; overflow goes into a collapsed details block.

5. **Mid-block break check.** At the 75-minute mark (your profile's `hyperfocus_break_minutes`), the next call to `get_time_context` returns `current_session_length` past the threshold. The hyperfocus-formatter calls `request_break_if_needed` and prepends one line to its next response:

   ```
   Session length: 78 minutes. You set the threshold at 75. Your stated intent: "review PR <id>". Suggested next action: stand_and_stretch.
   ```

   One line. Once. Not a block. If you keep going past 90 minutes the next rung escalates per the chronometric ladder; that's by design but it stays a nudge, not a stop.

6. **Session-end + record.** When you say "done", calls `mcp-chronometric.mark_session_end({summary: "<your one-line outcome>"})` and `mcp-cognitive-graph.record_fact` to anchor the verdict (e.g. _"PR #482 reviewed: 3 substantive comments, looks good with those addressed"_) against the project. Tomorrow's `recall_decisions` will surface it.

Nothing in this flow calls a remote service. Nothing leaves your laptop. The graph, the chronometer, and the formatter are all local.

## Sample output

A realistic 13:30 review block on a Wednesday. You're a senior engineer with two weeks of graph history. The PR touches three files; you reviewed one of them six weeks ago.

```
Session marked. Intent: "review PR #482". Started 13:32. I'll surface a break nudge at 75 min.

### Prior context

**auth/session.py** — 1 prior comment from your review of PR #441 (6 weeks ago):
> "Don't merge: this session-store mutation isn't covered by the existing
>  fuzz tests. Add a property test before merging."
Status: that comment was addressed in PR #441; you approved it. Surfacing
because the file is touched again here.

**auth/handlers.py** — no prior comments. File is in the graph (touched in
PR #441's review) but you didn't comment on it then.

**tests/test_session.py** — file is new to your graph. No prior context.

### Recent decisions on this project (top 3)

1. (2026-05-12) "no business logic in the auth layer — keep it pure
   request/response shaping"  conf 0.88
2. (2026-05-08) "session keys rotate every 24h, never on-demand"  conf 0.91
3. (2026-04-30) "auth tests must use the fuzz harness, not unit asserts
   alone"  conf 0.84

---

Open PR #482 in your browser. Start with auth/session.py — the prior
comment plus decision #3 both touch what you'll see there. Draft your
comments here as you go; I'll shape them verdict-first.
```

Realistic, not idealised. The third file has no graph context because it's a new test file. One prior comment is surfaced and explicitly marked as historical (already-addressed in the earlier PR) so you don't relitigate it — but it's surfaced so you can decide whether the new change re-introduces the original concern.

### A drafted comment, shaped

You read `auth/session.py` and want to leave a comment. You type the rough version:

> I think this introduces a race condition because the session-store mutation isn't guarded by the lock that the rotation logic uses, and decision #2 from the recall says rotation is every 24h not on-demand so this on-demand path shouldn't exist at all, and also there's no fuzz test for it.

The hyperfocus-formatter (Tier B, because "review" is in the original prompt) reshapes it to:

```
Don't merge: on-demand rotation conflicts with the 24h-only decision (#2).

- The mutation isn't lock-guarded; rotation logic uses `session_lock` on the
  same store.
- Project decision (2026-05-08): keys rotate every 24h, never on-demand —
  this PR adds an on-demand path.
- No fuzz coverage for the new code path (decision 2026-04-30: auth tests
  must use the fuzz harness).
```

Three substantive bullets. Verdict on the first line. You paste that into GitHub.

### Mid-block break trigger

At 13:32 + 78 minutes = 14:50, you ask for status. The session is past the 75-minute threshold:

```
Session length: 78 minutes. You set the threshold at 75. Your stated
intent: "review PR #482". Suggested next action: stand_and_stretch.

You've left 3 substantive comments so far. auth/session.py and
auth/handlers.py reviewed; tests/test_session.py not yet.
```

One line of break nudge, one line of where-you-are. No moralising. You decide.

### Session close

You finish the third file, leave one more comment, say `done`. The session is closed, duration recorded, and the outcome (`"PR #482 reviewed: 4 substantive comments, looks good with those addressed"`) is written to the graph as a fact against the project. The next time someone (you, or any teammate using the same graph) reviews a PR that touches `auth/session.py`, that comment-history surfaces again.

### What the first review of the day looks like (cold graph on a new repo)

The first time you run a review block against a repo NeuroDock hasn't seen, the recall is empty:

```
Session marked. Intent: "review PR #482". Started 09:14.

No prior comments on any of the changed files — this is the first review
NeuroDock has seen for this project.

No recent decisions recorded for this project either. You can record one
mid-review by saying "record decision: <text>"; it will surface next time.

Open the PR. Draft your comments here as you go; I'll shape them
verdict-first.
```

That is honest. The substrate did not hallucinate prior comments. The first review is slow because there is no warmed-up graph yet — which is the same trade-off the morning-brief example calls out. After 2–3 reviews on the same repo, the graph starts pulling its weight.

## Variations

### Solo IC, single-repo

The flow above is the default. Nothing to change. The graph warms up after a handful of reviews.

### Tech lead reviewing across many repos

Add the project name to the prompt explicitly:

> I'm reviewing PR <url> on the **billing-service** project. Files: …

The cognitive graph indexes facts and entities by project name; being explicit prevents cross-project bleed. (Files with the same path in different projects — e.g. `tests/test_session.py` exists in both `auth-service` and `billing-service` — are kept separate by the project anchor.)

### Mentoring a junior

If the review is also coaching, pair this with `plugins/skill-eng-manager-1on1/`. Use the prompt:

> I'm reviewing PR <url> by <junior name>. Files: … This is also a coaching review — surface anything they and I have already talked about on these themes (testing discipline, error handling, whatever you have). Shape my comments verdict-first **and** explanation-second since this is mentoring.

The eng-manager skill's recall pulls coaching-themed facts about that person from prior 1:1s; the review prompt pulls file-level history. Both flow into the same shaped comments. Then when you record the session-end, the verdict is anchored against both the project (so the next review of the same file sees it) and the report (so your next 1:1 prep sees it).

This is the only variation where the comment shaping is **not** verdict-only — mentoring reviews want the reasoning visible, not collapsed. The hyperfocus-formatter has a `mentor_mode` profile flag (off by default) that keeps bullets visible regardless of chunk overflow.

### Reviewing your own PR before requesting review

Drop the prior-comments recall (your own draft has none) and keep just the decision recall:

> I'm self-reviewing PR <url> before requesting review. Project: <name>. Surface the top decisions on this project. Shape any concerns I list verdict-first.

This catches the most common pre-review screwup: shipping a PR that contradicts a recent team decision.

## Pairing

- **[`plugins/skill-software-engineer-daily/`](../../plugins/skill-software-engineer-daily/)** — the in-tree skill that wraps the review flow plus two others (deep-work-block, async standup). Once that skill's `SKILL.md` ships, the literal prompts above are absorbed into the skill's activation paths and you can invoke them by phrase. (A parallel agent is shipping that skill alongside this example.)
- **[`packages/skills/hyperfocus-formatter/`](../../packages/skills/hyperfocus-formatter/)** — the verdict-first shaping. The design-critique phrase triggers (which include "review", "critique", "walk through") are why the prompt in this walkthrough uses those words.
- **[`plugins/skill-eng-manager-1on1/`](../../plugins/skill-eng-manager-1on1/)** — for the mentoring-review variation. Same graph.
- **[`packages/skills/audhd-context-recovery/`](../../packages/skills/audhd-context-recovery/)** — if you come back to a half-reviewed PR after more than 8 hours, the `/resume` skill activates and re-surfaces the session intent plus the comments you already left.

## What this is NOT

This bears repeating because it's the most common misread of the example: **NeuroDock does not auto-review code.** It does not parse the diff. It does not have an opinion on whether the logic is correct, the tests are adequate, or the architecture is sound. Those judgments are still yours. Tools that read code (linters, type-checkers, AI code reviewers, the team senior who's been there longer) live elsewhere — use them, in addition to this.

What NeuroDock does is lower the cost of getting **into** the review and **structuring** the output of the review:

- Session bracketing so the 90 minutes have a defined beginning and a defined end.
- File-level recall so you don't relitigate concerns you already raised and you don't miss the fact that you flagged this file before.
- Project-level decision recall so you catch the case where the PR contradicts a team agreement.
- Verdict-first shaping so the comments you leave land cleanly and your future-self can parse them on the next review.
- A break nudge at your own pre-set threshold, exactly once, because reviewing past your fatigue point is when bad comments happen.

If the substrate ever **tells you a PR is good or bad**, that is a bug — file an issue. It can't know. You can.

## A note on tone

The review block is one of the few engineering activities where being curt is virtuous. The hyperfocus-formatter's Tier B output is curt by design — it strips the preamble, drops the bullet count to your `max_chunk_size`, and forces the verdict to the top. That is not the substrate being rude; that is how a good review comment should already look. If your team's reviewing culture rewards verbose, hedging, "I might be wrong but…" comments, this skill will reshape you out of that habit. That is intentional.

The substrate is also explicitly NOT a reviewer-scorecard. There is no count of "how many PRs you reviewed this week" surfaced anywhere. Engineers who run themselves on review-throughput burn out and leave bad comments; engineers who run themselves on review-continuity (what did I think last time, what did the team decide, what's the verdict here) ship more careful reviews for longer. NeuroDock picks continuity.

## See also

- [`sample-conversation.md`](./sample-conversation.md) — a standalone end-to-end conversation showing the review block with realistic tool calls and outputs.
- [`../founders-morning-brief/`](../founders-morning-brief/) — the parallel "calm ritual" example for solo founders; same substrate, different surface.
- [MANIFESTO.md](../../MANIFESTO.md) — the five principles. "Continuity over throughput" is grounded there.
- [ADR 0001 — Chronometric tool design](../../docs/decisions/0001-chronometric-tool-design.md), [ADR 0002 — Cognitive graph tool design](../../docs/decisions/0002-cognitive-graph-tool-design.md) — the two pillars this review flow stitches together.
